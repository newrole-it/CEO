import { randomBytes } from "crypto"
import db from "db"
import { enqueueSheetSync, SHEET_SYNC } from "src/server/queue/enqueue"
import { DELETED_STATUS, type ApplicationStatus } from "src/shared/applications"
import { appsScriptSource } from "./apps-script"
import { planSheetSync, type SheetRead, type SyncApplication } from "./sheet-sync"
import {
  buildSheetTable,
  dayToDate,
  parseCsv,
  readHeader,
  readRow,
  fieldsHash,
  sheetDate,
  SHEET_NAME,
  statusOptions,
  syncKeys,
  toCsv,
  writtenFields,
  type SheetApplication,
  type SheetFields,
  type SheetLocale,
  type SheetTable,
  type Workplace,
} from "./sheet-table"
import { createApplication, linkApplicationsToIndex, updateApplication } from "./service"

export { appsScriptSource, toCsv }
export type { SheetTable }

export const SYNC_TIMEOUT_MS = 20_000

const WEBHOOK =
  /^https:\/\/script\.google\.com\/(?:a\/macros\/[a-z0-9.-]+\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/
const SPREADSHEET = /^https:\/\/docs\.google\.com\/spreadsheets\/[^\s]+$/

/** The deployed web app URL: https://script.google.com/macros/s/…/exec (Workspace: /a/macros/<domain>/s/…/exec). */
export function isWebhookUrl(value: string): boolean {
  return WEBHOOK.test(value.trim())
}

export function isSpreadsheetUrl(value: string): boolean {
  return SPREADSHEET.test(value.trim())
}

export class SheetError extends Error {
  code: "invalid-webhook" | "invalid-spreadsheet"
  constructor(code: SheetError["code"], message: string) {
    super(message)
    this.name = "SheetError"
    this.code = code
  }
}

/** The person's applications as the sheet shows them, with the work mode of the indexed offer. */
async function sheetApplications(userId: number): Promise<SyncApplication[]> {
  const rows = await db.application.findMany({
    where: { userId },
    include: { job: { select: { workplaceType: true } }, sheetRow: true },
  })
  return rows.map(({ job, sheetRow, ...app }) => ({
    ...app,
    workplace: job && job.workplaceType !== "UNKNOWN" ? (job.workplaceType as Workplace) : null,
    sheetRow: sheetRow ? { hash: sheetRow.hash, syncedAt: sheetRow.syncedAt } : null,
  }))
}

/** The applications table for the CSV export. Notes follow SheetLink.includeNotes. */
export async function sheetTable(userId: number, locale: SheetLocale = "pl"): Promise<SheetTable> {
  const [apps, link] = await Promise.all([
    sheetApplications(userId),
    db.sheetLink.findUnique({ where: { userId }, select: { includeNotes: true } }),
  ])
  return buildSheetTable(apps, { locale, includeNotes: link?.includeNotes ?? true, target: "csv" })
}

export type SyncResult = {
  status: "synced" | "not-configured" | "failed"
  rows: number
  message: string
  /** What came in from the sheet in this sync */
  imported?: { created: number; updated: number; deleted: number; skipped: number }
  /**
   * Whether the tab is a table with a Status dropdown: "no-service" when the Google Sheets API
   * service is not added to the script, "error" when Google refused; null from an older script.
   */
  table?: "ok" | "no-service" | "error" | null
  /** Google's reason when the table could not be made */
  tableDetail?: string | null
}

/** Failure kinds stored as the "code: " prefix of SheetLink.lastError (the settings screen translates them). */
export type SyncErrorCode =
  | "url"
  | "timeout"
  | "network"
  | "http"
  | "auth"
  | "secret"
  | "script"
  | "response"
  | "outdated"
  | "foreign"

const MESSAGES: Record<SyncErrorCode, string> = {
  url: "Adres webhooka musi mieć postać https://script.google.com/macros/s/…/exec.",
  timeout: "Apps Script nie odpowiedział w 20 s. Spróbuj ponownie za chwilę.",
  network: "Brak połączenia z Google. Sprawdź internet i spróbuj ponownie.",
  http: "Google odpowiedział błędem. Sprawdź, czy wdrożenie nadal istnieje.",
  auth: "Google odesłał stronę zamiast odpowiedzi skryptu: wdrożenie wymaga logowania albo starsza wersja skryptu przerwała się błędem. Wdróż najnowszy skrypt z dostępem „Każdy”.",
  secret: "Skrypt odrzucił sekret. Skopiuj skrypt z ustawień jeszcze raz i wdróż nową wersję.",
  script: "Skrypt zgłosił błąd. Wdróż najnowszą wersję skryptu z ustawień.",
  response: "Nieoczekiwana odpowiedź skryptu. Wdróż najnowszą wersję skryptu z ustawień.",
  outdated:
    "Skrypt w arkuszu jest w starej wersji i umie tylko zapisywać. Skopiuj nowy skrypt z ustawień i wdróż nową wersję.",
  foreign:
    "Zakładka ma dane, których newrole.it nie zapisał, więc ich nie nadpisze. Zsynchronizuj jeszcze raz.",
}

/** SheetLink.lastError: "code: message (what the script or Google said)". */
export function syncErrorText(code: SyncErrorCode, detail: string): string {
  return `${code}: ${MESSAGES[code]}${detail ? ` (${detail})` : ""}`.slice(0, 500)
}

/** What the script or Google said, from a stored lastError; null when it said nothing more. */
export function syncErrorDetail(value: string | null): string | null {
  const error = parseSyncError(value)
  if (!error?.code) return null
  const prefix = `${MESSAGES[error.code]} (`
  if (!error.detail.startsWith(prefix)) return null
  return (
    error.detail
      .slice(prefix.length)
      .replace(/\)$/, "")
      .replace(/^exception: /, "") || null
  )
}

/** "auth: …" → { code: "auth", detail: "…" }; unknown text keeps the whole string as detail. */
export function parseSyncError(
  value: string | null
): { code: SyncErrorCode | null; detail: string } | null {
  if (!value) return null
  const match = /^([a-z]+): ([\s\S]*)$/.exec(value)
  if (match && match[1] in MESSAGES) return { code: match[1] as SyncErrorCode, detail: match[2] }
  return { code: null, detail: value }
}

/** Reads what the Apps Script web app answered (after Google's 302 to script.googleusercontent.com). */
export function readSyncResponse(
  status: number,
  contentType: string,
  text: string,
  sent: number
):
  | { ok: true; rows: number; table: SyncResult["table"]; tableDetail: string | null }
  | { ok: false; code: SyncErrorCode; detail: string } {
  if (status === 401 || status === 403) return { ok: false, code: "auth", detail: `HTTP ${status}` }
  if (status >= 400) return { ok: false, code: "http", detail: `HTTP ${status}` }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    if (/html/i.test(contentType) || /^\s*</.test(text))
      return { ok: false, code: "auth", detail: "HTML instead of JSON" }
    return { ok: false, code: "response", detail: text.slice(0, 120) }
  }
  const body = data as { ok?: unknown; rows?: unknown; error?: unknown; table?: unknown }
  if (body?.ok === true) {
    const table = typeof body.table === "string" ? body.table : null
    return {
      ok: true,
      rows: typeof body.rows === "number" ? body.rows : sent,
      table: table === "ok" || table === "no-service" ? table : table ? "error" : null,
      tableDetail: table && table.startsWith("error") ? table.slice(0, 200) : null,
    }
  }
  return { ok: false, ...scriptError(body?.error) }
}

function scriptError(error: unknown): { code: SyncErrorCode; detail: string } {
  if (error === "bad-secret") return { code: "secret", detail: "bad-secret" }
  // The one-way script answers "read" as a write without a header.
  if (error === "no-header" || error === "unknown-action")
    return { code: "outdated", detail: String(error) }
  if (error === "foreign-tab") return { code: "foreign", detail: "foreign-tab" }
  return { code: "script", detail: String(error ?? "ok:false").slice(0, 120) }
}

/** The tab as the script read it, or why it could not. */
export function readSheetResponse(
  status: number,
  contentType: string,
  text: string
): { ok: true; read: SheetRead } | { ok: false; code: SyncErrorCode; detail: string } {
  const answer = readSyncResponse(status, contentType, text, 0)
  if (!answer.ok) return answer
  const body = JSON.parse(text) as Partial<SheetRead>
  const grid = (value: unknown): string[][] =>
    Array.isArray(value)
      ? value.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []))
      : []
  const header = Array.isArray(body.header) ? body.header.map((cell) => String(cell ?? "")) : []
  const rows = grid(body.rows)
  const links = Array.isArray(body.links)
    ? body.links.map((link) => (typeof link === "string" && link ? link : null))
    : []
  return { ok: true, read: { exists: body.exists !== false, header, rows, links } }
}

/** A sheet row's fields as an application change. Company and role are never cleared. */
function patchFrom(fields: SheetFields) {
  const day = (value: string | null | undefined) =>
    value === undefined ? undefined : value ? dayToDate(value) : null
  return {
    company: fields.company || undefined,
    title: fields.title || undefined,
    url: fields.url,
    location: fields.location,
    origin: fields.origin,
    status: (fields.status ?? undefined) as ApplicationStatus | undefined,
    stageNote: fields.stageNote,
    salaryText: fields.salaryText,
    statedSalary: fields.statedSalary,
    nextStep: fields.nextStep,
    nextStepAt: day(fields.nextStepAt),
    notes: fields.notes,
    contact: fields.contact,
    appliedAt: fields.appliedAt ? dayToDate(fields.appliedAt) : undefined,
  }
}

/** New applications from sheet rows or CSV lines. Returns how many were created. */
export async function importRows(
  userId: number,
  rows: SheetFields[],
  source: "sheet" | "csv"
): Promise<{ created: number; skipped: number }> {
  let created = 0
  let skipped = 0
  for (const fields of rows) {
    const patch = patchFrom(fields)
    try {
      const result = await createApplication({
        userId,
        ...patch,
        url: patch.url && /^https?:\/\//i.test(patch.url) ? patch.url : null,
        status: patch.status === DELETED_STATUS ? undefined : patch.status,
        source,
        channel: source === "sheet" ? "sheet" : "web",
        quiet: true,
      })
      if (result.created) created += 1
      else skipped += 1
    } catch (error) {
      console.error(`Could not import a ${source} row`, error)
      skipped += 1
    }
  }
  return { created, skipped }
}

async function callScript(
  webhookUrl: string,
  body: Record<string, unknown>
): Promise<
  | { ok: true; response: Response; text: string }
  | { ok: false; code: SyncErrorCode; detail: string }
> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow",
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    })
    return { ok: true, response, text: await response.text().catch(() => "") }
  } catch (error) {
    const name = error instanceof Error ? error.name : ""
    if (name === "TimeoutError" || name === "AbortError")
      return { ok: false, code: "timeout", detail: "" }
    return {
      ok: false,
      code: "network",
      detail: error instanceof Error ? error.message.slice(0, 120) : "",
    }
  }
}

/**
 * Two-way sync with the person's sheet: reads the tab, brings new rows, edits and deletions into
 * newrole.it (the newer change wins), then writes the merged table back with IDs.
 */
export async function syncSheet(userId: number): Promise<SyncResult> {
  const link = await db.sheetLink.findUnique({ where: { userId } })
  if (!link?.webhookUrl) {
    return {
      status: "not-configured",
      rows: 0,
      message: "Arkusz Google nie jest połączony. Skonfiguruj go w Ustawieniach → Arkusz Google.",
    }
  }
  const fail = async (code: SyncErrorCode, detail: string): Promise<SyncResult> => {
    await db.sheetLink.update({
      where: { userId },
      data: { lastError: syncErrorText(code, detail) },
    })
    return { status: "failed", rows: 0, message: MESSAGES[code] }
  }
  if (!isWebhookUrl(link.webhookUrl)) return fail("url", "")
  const tab = link.tabName || SHEET_NAME
  const includeNotes = link.includeNotes

  const reading = await callScript(link.webhookUrl, {
    secret: link.secret,
    action: "read",
    sheet: tab,
  })
  if (!reading.ok) return fail(reading.code, reading.detail)
  const read = readSheetResponse(
    reading.response.status,
    reading.response.headers.get("content-type") ?? "",
    reading.text
  )
  if (!read.ok) return fail(read.code, read.detail)

  const plan = planSheetSync(read.read, await sheetApplications(userId), {
    includeNotes,
    now: new Date(),
  })
  const { created, skipped } = await importRows(userId, plan.creates, "sheet")
  let updated = 0
  for (const change of plan.updates) {
    try {
      await updateApplication({
        userId,
        id: change.id,
        channel: "sheet",
        ...patchFrom(change.fields),
        quiet: true,
      })
      updated += 1
    } catch (error) {
      console.error("Could not apply a sheet edit", error)
    }
  }
  for (const id of plan.deletes) {
    await updateApplication({
      userId,
      id,
      channel: "sheet",
      status: DELETED_STATUS,
      quiet: true,
    }).catch((error) => console.error("Could not mark an application deleted", error))
  }

  await linkApplicationsToIndex(userId)
  const apps = await sheetApplications(userId)
  const table = buildSheetTable(apps, { locale: "pl", includeNotes, target: "sheet" })
  const now = new Date()
  const writing = await callScript(link.webhookUrl, {
    secret: link.secret,
    action: "write",
    sheet: tab,
    header: table.header,
    rows: table.rows,
    links: table.links,
    linkColumn: table.header.indexOf("Stanowisko"),
    statusColumn: table.header.indexOf("Status"),
    statusOptions: statusOptions("pl"),
    adopt: plan.adopt,
    backupName: `${tab} (kopia ${sheetDate(now)})`,
    syncedAt: now.toISOString(),
  })
  if (!writing.ok) return fail(writing.code, writing.detail)
  const outcome = readSyncResponse(
    writing.response.status,
    writing.response.headers.get("content-type") ?? "",
    writing.text,
    table.rows.length
  )
  if (!outcome.ok) return fail(outcome.code, outcome.detail)
  if (outcome.tableDetail) console.warn(`Sheet table not updated: ${outcome.tableDetail}`)

  const keys = syncKeys(includeNotes)
  const written = new Set(table.ids)
  await db.$transaction([
    db.sheetRow.deleteMany({
      where: { application: { userId }, applicationId: { notIn: [...written] } },
    }),
    ...apps
      .filter((app) => written.has(app.id))
      .map((app) => {
        const hash = fieldsHash(writtenFields(app, { includeNotes }), keys)
        return db.sheetRow.upsert({
          where: { applicationId: app.id },
          create: { applicationId: app.id, hash, syncedAt: now },
          update: { hash, syncedAt: now },
        })
      }),
    db.sheetLink.update({
      where: { userId },
      data: { lastSyncedAt: now, lastRowCount: outcome.rows, lastError: null },
    }),
  ])
  const imported = {
    created,
    updated,
    deleted: plan.deletes.length,
    skipped: skipped + plan.skipped,
  }
  return {
    status: "synced",
    rows: outcome.rows,
    imported,
    table: outcome.table,
    tableDetail: outcome.tableDetail,
    message: `Arkusz zaktualizowany: ${outcome.rows} ${outcome.rows === 1 ? "wiersz" : "wierszy"}.`,
  }
}

export class CsvImportError extends Error {
  code = "csv-columns" as const
}

/**
 * Applications from a CSV: the sheet layout, the old export or the person's own columns, matched by
 * header. A line already in newrole.it (same ID, link, or company, role and day) is skipped.
 * The sheet gets the new ones on the next sync.
 */
export async function importCsv(
  userId: number,
  text: string
): Promise<{ created: number; skipped: number }> {
  const [header = [], ...lines] = parseCsv(text)
  const keys = readHeader(header)
  if (!keys.includes("company") || !keys.includes("title")) {
    throw new CsvImportError("Plik musi mieć kolumny Firma i Stanowisko (albo Company i Role).")
  }
  const existing = await db.application.findMany({
    where: { userId },
    select: { id: true, company: true, title: true, appliedAt: true },
  })
  const fold = (value: string | null | undefined) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  const known = new Set(
    existing.map((app) => `${fold(app.company)}|${fold(app.title)}|${sheetDate(app.appliedAt)}`)
  )
  const ids = new Set(existing.map((app) => app.id))
  const fresh: SheetFields[] = []
  let skipped = 0
  for (const cells of lines) {
    const row = readRow(keys, cells)
    if (!row) continue
    const key = `${fold(row.fields.company)}|${fold(row.fields.title)}|${
      row.fields.appliedAt ?? ""
    }`
    if (!row.fields.company || !row.fields.title || (row.id && ids.has(row.id)) || known.has(key)) {
      skipped += 1
      continue
    }
    known.add(key)
    fresh.push(row.fields)
  }
  const result = await importRows(userId, fresh, "csv")
  await linkApplicationsToIndex(userId)
  if (result.created) await scheduleSheetSync(userId)
  return { created: result.created, skipped: skipped + result.skipped }
}

/**
 * Pulls edits made in the sheet: a sync for every connected sheet with automatic sync whose last
 * sync is older than this. The app's background loop calls it; enqueueing skips people with one
 * already queued.
 */
export const SHEET_PULL_MS = 5 * 60_000
/**
 * After a failed sync the pull waits this long, so a sheet that keeps failing is not called every
 * minute. A change in newrole.it and "Synchronizuj teraz" still sync at once.
 */
export const SHEET_RETRY_MS = 60 * 60_000

export async function enqueueStaleSheetSyncs(now = new Date()): Promise<number> {
  const links = await db.sheetLink.findMany({
    where: {
      webhookUrl: { not: null },
      autoSync: true,
      OR: [
        { lastError: null, lastSyncedAt: null },
        { lastError: null, lastSyncedAt: { lt: new Date(now.getTime() - SHEET_PULL_MS) } },
        // A failed sync writes lastError, so updatedAt is when it ended.
        { lastError: { not: null }, updatedAt: { lt: new Date(now.getTime() - SHEET_RETRY_MS) } },
      ],
    },
    select: { userId: true },
  })
  for (const link of links) await enqueueSheetSync(link.userId)
  return links.length
}

/**
 * Debounced sync after a change: only with a webhook and automatic mode on. Never throws, so a
 * tracker change cannot fail because of the sheet.
 */
export async function scheduleSheetSync(userId: number): Promise<void> {
  try {
    const link = await db.sheetLink.findUnique({
      where: { userId },
      select: { webhookUrl: true, autoSync: true },
    })
    if (!link?.webhookUrl || !link.autoSync) return
    await enqueueSheetSync(userId)
  } catch (error) {
    console.error("Could not schedule the sheet sync", error)
  }
}

/** The person's sheet settings, created with a fresh 32-byte secret the first time. */
export async function ensureSheetLink(userId: number) {
  const existing = await db.sheetLink.findUnique({ where: { userId } })
  if (existing) return existing
  try {
    return await db.sheetLink.create({
      data: { userId, secret: randomBytes(32).toString("hex") },
    })
  } catch (error) {
    const again = await db.sheetLink.findUnique({ where: { userId } })
    if (again) return again
    throw error
  }
}

export async function saveSheetLink(
  userId: number,
  patch: {
    webhookUrl?: string | null
    spreadsheetUrl?: string | null
    autoSync?: boolean
    includeNotes?: boolean
    tabName?: string
  }
) {
  const link = await ensureSheetLink(userId)
  const data: {
    webhookUrl?: string | null
    spreadsheetUrl?: string | null
    autoSync?: boolean
    includeNotes?: boolean
    tabName?: string
    lastError?: null
  } = {}
  if (patch.tabName !== undefined) {
    const tab = patch.tabName.trim().slice(0, 100) || SHEET_NAME
    if (tab !== link.tabName) {
      data.tabName = tab
      // Another tab: nothing in it was written by newrole.it yet.
      await db.sheetRow.deleteMany({ where: { application: { userId } } })
    }
  }
  if (patch.webhookUrl !== undefined) {
    const url = patch.webhookUrl?.trim() || null
    if (url && !isWebhookUrl(url)) throw new SheetError("invalid-webhook", MESSAGES.url)
    if (url !== link.webhookUrl) {
      data.webhookUrl = url
      data.lastError = null
    }
  }
  if (patch.spreadsheetUrl !== undefined) {
    const url = patch.spreadsheetUrl?.trim() || null
    if (url && !isSpreadsheetUrl(url)) {
      throw new SheetError(
        "invalid-spreadsheet",
        "Link do arkusza musi zaczynać się od https://docs.google.com/spreadsheets/."
      )
    }
    data.spreadsheetUrl = url
  }
  if (patch.autoSync !== undefined) data.autoSync = patch.autoSync
  if (patch.includeNotes !== undefined) data.includeNotes = patch.includeNotes
  if (!Object.keys(data).length) return link
  return db.sheetLink.update({ where: { userId }, data })
}

export type SheetStatus = {
  configured: boolean
  webhookUrl: string | null
  spreadsheetUrl: string | null
  autoSync: boolean
  includeNotes: boolean
  tabName: string
  lastSyncedAt: Date | null
  lastRowCount: number | null
  lastError: string | null
  lastErrorCode: SyncErrorCode | null
  /** What the script or Google said, in the spreadsheet owner's language */
  lastErrorDetail: string | null
  /** When a queued sync was due; a time well in the past means the app is not running */
  pendingSince: Date | null
}

export async function sheetStatus(userId: number): Promise<SheetStatus> {
  const [link, pending] = await Promise.all([
    db.sheetLink.findUnique({ where: { userId } }),
    db.backgroundTask.findFirst({
      where: { type: SHEET_SYNC, status: "PENDING", payload: { path: ["userId"], equals: userId } },
      orderBy: { runAt: "asc" },
      select: { runAt: true },
    }),
  ])
  const error = parseSyncError(link?.lastError ?? null)
  return {
    configured: Boolean(link?.webhookUrl),
    webhookUrl: link?.webhookUrl ?? null,
    spreadsheetUrl: link?.spreadsheetUrl ?? null,
    autoSync: link?.autoSync ?? true,
    includeNotes: link?.includeNotes ?? true,
    tabName: link?.tabName ?? SHEET_NAME,
    lastSyncedAt: link?.lastSyncedAt ?? null,
    lastRowCount: link?.lastRowCount ?? null,
    lastError: link?.lastError ?? null,
    lastErrorCode: error?.code ?? null,
    lastErrorDetail: syncErrorDetail(link?.lastError ?? null),
    pendingSince: pending?.runAt ?? null,
  }
}
