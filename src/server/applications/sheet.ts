import { randomBytes } from "crypto"
import db from "db"
import { enqueueSheetSync, SHEET_SYNC } from "src/server/queue/enqueue"
import { appsScriptSource } from "./apps-script"
import {
  buildSheetTable,
  SHEET_NAME,
  toCsv,
  type SheetLocale,
  type SheetTable,
} from "./sheet-table"

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

/** The applications table for the sheet and the CSV export. Notes follow SheetLink.includeNotes. */
export async function sheetTable(userId: number, locale: SheetLocale = "pl"): Promise<SheetTable> {
  const [apps, link] = await Promise.all([
    db.application.findMany({ where: { userId } }),
    db.sheetLink.findUnique({ where: { userId }, select: { includeNotes: true } }),
  ])
  return buildSheetTable(apps, { locale, includeNotes: link?.includeNotes ?? true })
}

export type SyncResult = {
  status: "synced" | "not-configured" | "failed"
  rows: number
  message: string
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

const MESSAGES: Record<SyncErrorCode, string> = {
  url: "Adres webhooka musi mieć postać https://script.google.com/macros/s/…/exec.",
  timeout: "Apps Script nie odpowiedział w 20 s. Spróbuj ponownie za chwilę.",
  network: "Brak połączenia z Google. Sprawdź internet i spróbuj ponownie.",
  http: "Google odpowiedział błędem. Sprawdź, czy wdrożenie nadal istnieje.",
  auth: "Google prosi o logowanie. Wdróż skrypt z dostępem „Każdy” i wklej nowy adres /exec.",
  secret: "Skrypt odrzucił sekret. Skopiuj skrypt z ustawień jeszcze raz i wdróż nową wersję.",
  script: "Skrypt zgłosił błąd. Wdróż najnowszą wersję skryptu z ustawień.",
  response: "Nieoczekiwana odpowiedź skryptu. Wdróż najnowszą wersję skryptu z ustawień.",
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
): { ok: true; rows: number } | { ok: false; code: SyncErrorCode; detail: string } {
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
  const body = data as { ok?: unknown; rows?: unknown; error?: unknown }
  if (body?.ok === true) return { ok: true, rows: typeof body.rows === "number" ? body.rows : sent }
  if (body?.error === "bad-secret") return { ok: false, code: "secret", detail: "bad-secret" }
  return { ok: false, code: "script", detail: String(body?.error ?? "ok:false").slice(0, 120) }
}

/** Sends the whole table to the person's Apps Script web app now and records the outcome. */
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
      data: {
        lastError: `${code}: ${MESSAGES[code]}${detail ? ` (${detail})` : ""}`.slice(0, 500),
      },
    })
    return { status: "failed", rows: 0, message: MESSAGES[code] }
  }
  if (!isWebhookUrl(link.webhookUrl)) return fail("url", "")

  const table = await sheetTable(userId, "pl")
  let response: Response
  try {
    response = await fetch(link.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: link.secret,
        sheet: SHEET_NAME,
        header: table.header,
        rows: table.rows,
        syncedAt: new Date().toISOString(),
      }),
      redirect: "follow",
      signal: AbortSignal.timeout(SYNC_TIMEOUT_MS),
    })
  } catch (error) {
    const name = error instanceof Error ? error.name : ""
    if (name === "TimeoutError" || name === "AbortError") return fail("timeout", "")
    return fail("network", error instanceof Error ? error.message.slice(0, 120) : "")
  }
  const text = await response.text().catch(() => "")
  const outcome = readSyncResponse(
    response.status,
    response.headers.get("content-type") ?? "",
    text,
    table.rows.length
  )
  if (!outcome.ok) return fail(outcome.code, outcome.detail)
  await db.sheetLink.update({
    where: { userId },
    data: { lastSyncedAt: new Date(), lastRowCount: outcome.rows, lastError: null },
  })
  return {
    status: "synced",
    rows: outcome.rows,
    message: `Arkusz zaktualizowany: ${outcome.rows} ${outcome.rows === 1 ? "wiersz" : "wierszy"}.`,
  }
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
  }
) {
  const link = await ensureSheetLink(userId)
  const data: {
    webhookUrl?: string | null
    spreadsheetUrl?: string | null
    autoSync?: boolean
    includeNotes?: boolean
    lastError?: null
  } = {}
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
  lastSyncedAt: Date | null
  lastRowCount: number | null
  lastError: string | null
  lastErrorCode: SyncErrorCode | null
  /** When a queued sync was due; a time well in the past means the worker is not running */
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
    lastSyncedAt: link?.lastSyncedAt ?? null,
    lastRowCount: link?.lastRowCount ?? null,
    lastError: link?.lastError ?? null,
    lastErrorCode: error?.code ?? null,
    pendingSince: pending?.runAt ?? null,
  }
}
