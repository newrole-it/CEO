import { createHash } from "node:crypto"
import {
  APPLICATION_STATUSES,
  DELETED_STATUS,
  PICKABLE_STATUSES,
  STAGE_RECORDING_STATUSES,
  statusLabel,
  type ApplicationSource,
  type ApplicationStatus,
} from "src/shared/applications"
import { compareApplications } from "./logic"

/**
 * The applications table as the Google Sheet and the CSV export show it, and the way back: a row
 * someone typed or edited in the sheet, or a CSV line, read into application fields. Pure, no
 * database. The columns follow the person's own tracker: Lp., Data aplikacji, Firma, Stanowisko,
 * Lokalizacja / tryb, Źródło, Status, Ostatnia aktualizacja, Następny krok / uwagi, then the offer's
 * salary range.
 */

export type SheetLocale = "pl" | "en"
export type SheetTable = {
  header: string[]
  rows: string[][]
  /** Application id per row, in the hidden ID column too */
  ids: string[]
  /** The offer link per row: the sheet puts it on the role, the CSV in a Link column */
  links: (string | null)[]
}

export const SHEET_NAME = "Aplikacje"

/** Hidden columns. The same in both languages: the script finds them by these names. */
export const ID_HEADER = "newrole.it ID"
export const EDITED_HEADER = "newrole.it edited"

type Column =
  | "lp"
  | "applied"
  | "company"
  | "title"
  | "place"
  | "origin"
  | "status"
  | "offerSalary"
  | "mySalary"
  | "updated"
  | "next"
  | "link"
  | "id"
  | "edited"

const HEADERS: Record<SheetLocale, Record<Column, string>> = {
  pl: {
    lp: "Lp.",
    applied: "Data aplikacji",
    company: "Firma",
    title: "Stanowisko",
    place: "Lokalizacja / tryb",
    origin: "Źródło",
    status: "Status",
    offerSalary: "Widełki z ogłoszenia",
    mySalary: "Moje widełki",
    updated: "Ostatnia aktualizacja",
    next: "Następny krok / uwagi",
    link: "Link",
    id: ID_HEADER,
    edited: EDITED_HEADER,
  },
  en: {
    lp: "No.",
    applied: "Applied on",
    company: "Company",
    title: "Role",
    place: "Location / mode",
    origin: "Source",
    status: "Status",
    offerSalary: "Salary in the offer",
    mySalary: "My salary",
    updated: "Last update",
    next: "Next step / notes",
    link: "Link",
    id: ID_HEADER,
    edited: EDITED_HEADER,
  },
}

const SOURCES: Record<SheetLocale, Record<ApplicationSource, string>> = {
  pl: {
    nowarola: "newrole.it",
    extension: "Rozszerzenie",
    manual: "Ręcznie",
    mcp: "Claude (MCP)",
    gmail: "Gmail",
    sheet: "Arkusz Google",
    csv: "Import CSV",
  },
  en: {
    nowarola: "newrole.it",
    extension: "Extension",
    manual: "Manual",
    mcp: "Claude (MCP)",
    gmail: "Gmail",
    sheet: "Google Sheet",
    csv: "CSV import",
  },
}

/** How the application got into newrole.it (not where the offer was: that is Źródło). */
export function sourceLabel(source: string, locale: SheetLocale = "pl"): string {
  return SOURCES[locale][source as ApplicationSource] ?? source
}

const WORKPLACE: Record<SheetLocale, Record<Workplace, string>> = {
  pl: { REMOTE: "zdalnie", HYBRID: "hybrydowo", ONSITE: "stacjonarnie" },
  en: { REMOTE: "remote", HYBRID: "hybrid", ONSITE: "on-site" },
}

const NEXT_STEP: Record<SheetLocale, string> = { pl: "Następny krok", en: "Next step" }
const STAGE: Record<SheetLocale, string> = { pl: "Etap", en: "Stage" }
const CLOSED_AFTER: Record<SheetLocale, string> = { pl: "Po etapie", en: "After stage" }
const STAGE_SEPARATOR = " · "

export type Workplace = "REMOTE" | "HYBRID" | "ONSITE"

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Warsaw",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** YYYY-MM-DD in Europe/Warsaw; empty for no date. */
export function sheetDate(value: Date | null | undefined): string {
  if (!value || Number.isNaN(value.getTime())) return ""
  const parts = Object.fromEntries(
    dayFormat.formatToParts(value).map((part) => [part.type, part.value])
  )
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** DD.MM.RRRR in Europe/Warsaw, as in the person's sheet; empty for no date. */
export function sheetDay(value: Date | null | undefined): string {
  const iso = sheetDate(value)
  if (!iso) return ""
  const [year, month, day] = iso.split("-")
  return `${day}.${month}.${year}`
}

/**
 * A day typed in a sheet or a CSV as YYYY-MM-DD: DD.MM.RRRR, D.M.RR, DD/MM/RRRR (day first, as in
 * Polish) or RRRR-MM-DD, with an optional time after it. Null when it is not a real date.
 */
export function parseDay(text: string | null | undefined): string | null {
  const value = (text ?? "").trim()
  if (!value) return null
  let year: number
  let month: number
  let day: number
  const iso = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:\b|T)/.exec(value)
  const local = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})(?:\b|\s)/.exec(`${value} `)
  if (iso) {
    year = Number(iso[1])
    month = Number(iso[2])
    day = Number(iso[3])
  } else if (local) {
    day = Number(local[1])
    month = Number(local[2])
    year = Number(local[3]) + (local[3].length === 2 ? 2000 : 0)
  } else {
    return null
  }
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

/** Noon in Warsaw on that day, so the day survives any time zone. */
export function dayToDate(iso: string): Date {
  return new Date(`${iso}T12:00:00+01:00`)
}

/**
 * Text that a spreadsheet would run as a formula ("=IMPORTXML(…)" in a crawled job title) gets
 * a leading apostrophe, which Sheets hides and keeps as plain text.
 */
export function safeCell(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r\n?/g, "\n")
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d[\d\s.,]*$/.test(text)) return `'${text}`
  return text
}

function unsafeCell(value: string): string {
  return /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .toLowerCase()
}

/** What an application holds that the sheet shows. */
export type SheetApplication = {
  id: string
  company: string
  title: string
  status: string
  stageNote: string | null
  closedAtStage: string | null
  appliedAt: Date
  nextStep: string | null
  nextStepAt: Date | null
  location: string | null
  workplace: Workplace | null
  origin: string | null
  url: string | null
  salaryText: string | null
  statedSalary: string | null
  notes: string | null
  updatedAt: Date
}

/** Application fields a sheet row or a CSV line carries. A key is missing when its column is. */
export type SheetFields = {
  appliedAt?: string | null
  company?: string | null
  title?: string | null
  url?: string | null
  location?: string | null
  origin?: string | null
  status?: ApplicationStatus | null
  stageNote?: string | null
  closedAtStage?: ApplicationStatus | null
  salaryText?: string | null
  statedSalary?: string | null
  nextStep?: string | null
  nextStepAt?: string | null
  notes?: string | null
  contact?: string | null
}

/** The fields a sync compares; notes only when the sheet shows them. */
export function syncKeys(includeNotes: boolean): (keyof SheetFields)[] {
  const keys: (keyof SheetFields)[] = [
    "appliedAt",
    "company",
    "title",
    "url",
    "location",
    "origin",
    "status",
    "stageNote",
    "salaryText",
    "nextStep",
    "nextStepAt",
  ]
  return includeNotes ? [...keys, "notes"] : keys
}

// ------------------------------------------------------------------ cells

/** The status label alone, one of the sheet's dropdown options. */
function statusCell(app: SheetApplication, locale: SheetLocale): string {
  return statusLabel(app.status, locale)
}

/** The dropdown options in the Status column: every status a person can pick. */
export function statusOptions(locale: SheetLocale = "pl"): string[] {
  return PICKABLE_STATUSES.map((status) => statusLabel(status, locale))
}

function placeCell(app: SheetApplication, locale: SheetLocale): string {
  const mode = app.workplace ? WORKPLACE[locale][app.workplace] : null
  if (!mode) return app.location ?? ""
  if (!app.location) return mode
  return fold(app.location).includes(fold(mode)) ? app.location : `${app.location} / ${mode}`
}

/** The offer's site: "linkedin.com", "jobs.lever.co". */
export function offerSite(url: string | null): string | null {
  if (!url) return null
  try {
    const { protocol, hostname } = new URL(url)
    if (protocol !== "http:" && protocol !== "https:") return null
    return hostname.replace(/^www\./, "") || null
  } catch {
    return null
  }
}

/**
 * The stage and the stage it closed after (the Status cell is a dropdown, so they live here), the
 * next step with its day, then the notes:
 * "Etap: 2. rozmowa techniczna\nNastępny krok: Rozmowa z CTO (05.11.2026)\nPytać o zespół".
 */
function nextCell(app: SheetApplication, locale: SheetLocale, includeNotes: boolean): string {
  const lines: string[] = []
  const closed = app.closedAtStage
  if (closed && (STAGE_RECORDING_STATUSES as readonly string[]).includes(app.status))
    lines.push(`${CLOSED_AFTER[locale]}: ${statusLabel(closed, locale)}`)
  if (app.stageNote) lines.push(`${STAGE[locale]}: ${app.stageNote}`)
  if (app.nextStep || app.nextStepAt) {
    const when = app.nextStepAt ? `(${sheetDay(app.nextStepAt)})` : null
    lines.push(`${NEXT_STEP[locale]}: ${[app.nextStep, when].filter(Boolean).join(" ")}`)
  }
  if (includeNotes && app.notes) lines.push(app.notes)
  return lines.join("\n")
}

function cellFor(
  app: SheetApplication,
  column: Column,
  index: number,
  locale: SheetLocale,
  includeNotes: boolean
): string {
  switch (column) {
    case "lp":
      return String(index + 1)
    case "applied":
      return sheetDay(app.appliedAt)
    case "company":
      return app.company
    case "title":
      return app.title
    case "place":
      return placeCell(app, locale)
    case "origin":
      return app.origin ?? offerSite(app.url) ?? ""
    case "status":
      return statusCell(app, locale)
    case "offerSalary":
      return app.salaryText ?? ""
    case "mySalary":
      return app.statedSalary ?? ""
    case "updated":
      return sheetDay(app.updatedAt)
    case "next":
      return nextCell(app, locale, includeNotes)
    case "link":
      return app.url ?? ""
    case "id":
      return app.id
    case "edited":
      return ""
  }
}

/** The person's own tracker columns in their order, then the offer's salary range. */
const SHEET_COLUMNS: Column[] = [
  "lp",
  "applied",
  "company",
  "title",
  "place",
  "origin",
  "status",
  "updated",
  "next",
  "offerSalary",
  "id",
  "edited",
]

const CSV_COLUMNS: Column[] = [
  "lp",
  "applied",
  "company",
  "title",
  "place",
  "origin",
  "status",
  "updated",
  "next",
  "offerSalary",
  "link",
  "id",
]

/**
 * The table, newest active applications first. Deleted ones stay out. The sheet carries the offer
 * link on the role and hides the ID and edit-time columns; the CSV has a Link column instead.
 */
export function buildSheetTable(
  apps: SheetApplication[],
  opts: { locale?: SheetLocale; includeNotes?: boolean; target?: "sheet" | "csv" } = {}
): SheetTable {
  const locale = opts.locale ?? "pl"
  const includeNotes = opts.includeNotes !== false
  const columns = opts.target === "csv" ? CSV_COLUMNS : SHEET_COLUMNS
  const header = columns.map((column) => HEADERS[locale][column])
  const sorted = apps.filter((app) => app.status !== DELETED_STATUS).sort(compareApplications)
  return {
    header,
    rows: sorted.map((app, index) =>
      columns.map((column) => safeCell(cellFor(app, column, index, locale, includeNotes)))
    ),
    ids: sorted.map((app) => app.id),
    links: sorted.map((app) => app.url),
  }
}

// ------------------------------------------------------------------ reading

type ReadKey = Column | "stage" | "closedAt" | "nextOnly" | "due" | "notes" | "contact"

/** Header names, folded (no diacritics, lower case, words only), from this layout and older ones. */
const ALIASES: Record<string, ReadKey> = {}
const alias = (key: ReadKey, names: string[]) => {
  for (const name of names) ALIASES[foldHeader(name)] = key
}
alias("lp", ["Lp.", "Nr", "No.", "L.p."])
alias("applied", [
  "Data aplikacji",
  "Aplikowano",
  "Data",
  "Applied",
  "Applied on",
  "Date applied",
  "Date",
])
alias("company", ["Firma", "Company", "Pracodawca", "Employer"])
alias("title", ["Stanowisko", "Rola", "Role", "Position", "Title", "Job title"])
alias("place", [
  "Lokalizacja / tryb",
  "Lokalizacja",
  "Tryb",
  "Location / mode",
  "Location",
  "Miejsce",
])
alias("origin", ["Źródło", "Source", "Skąd"])
alias("status", ["Status"])
alias("stage", ["Etap", "Stage"])
alias("closedAt", ["Odrzucono po", "Closed after"])
alias("offerSalary", [
  "Widełki z ogłoszenia",
  "Wynagrodzenie",
  "Widełki",
  "Salary",
  "Salary in the offer",
])
alias("mySalary", ["Moje widełki", "Podane widełki", "Oczekiwania", "Stated salary", "My salary"])
alias("updated", [
  "Ostatnia aktualizacja",
  "Ostatnia zmiana",
  "Last update",
  "Last change",
  "W etapie od",
  "In stage since",
])
alias("next", ["Następny krok / uwagi", "Uwagi", "Next step / notes"])
alias("nextOnly", ["Następny krok", "Next step"])
alias("due", ["Termin", "Due"])
alias("notes", ["Notatki", "Notes"])
alias("contact", ["Kontakt", "Contact"])
alias("link", ["Link", "URL", "Ogłoszenie", "Oferta"])
alias("id", [ID_HEADER])
alias("edited", [EDITED_HEADER])

function foldHeader(text: string): string {
  return fold(text)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Which field each column holds, by its header. Unknown columns are left out (null). */
export function readHeader(header: string[]): (ReadKey | null)[] {
  const seen = new Set<ReadKey>()
  return header.map((name) => {
    const key = ALIASES[foldHeader(name ?? "")] ?? null
    if (!key || seen.has(key)) return null
    seen.add(key)
    return key
  })
}

const STATUS_BY_LABEL = new Map<string, ApplicationStatus>()
for (const status of APPLICATION_STATUSES) {
  STATUS_BY_LABEL.set(fold(statusLabel(status, "pl")), status)
  STATUS_BY_LABEL.set(fold(statusLabel(status, "en")), status)
  STATUS_BY_LABEL.set(fold(status), status)
}

/** Free text in the person's own words, mapped to the nearest status. Order matters. */
const STATUS_WORDS: [RegExp, ApplicationStatus][] = [
  [/usuni|deleted/, "DELETED"],
  [/odrzuc|odmow|reject|declin|negatyw/, "REJECTED"],
  [/wycofa|rezygn|withdr/, "WITHDRAWN"],
  [/brak odp|bez odp|ghost|cisza|no respon/, "GHOSTED"],
  [/przyj|zaakcept|accept|podpisa/, "ACCEPTED"],
  [/ofert|offer/, "OFFER"],
  [/final/, "FINAL"],
  [/rekrut|\bhr\b|screen/, "SCREENING"],
  [/zadani|task|case study|zadanie domowe/, "TASK"],
  [/rozmow|interview|spotkan|techn/, "INTERVIEW"],
]

function statusFromLabel(text: string): ApplicationStatus | null {
  return STATUS_BY_LABEL.get(fold(text.trim())) ?? null
}

/**
 * "Rozmowy · 2. rozmowa techniczna", "Odrzucono (po etapie: Rozmowy)" or the person's own words
 * ("Czekam na feedback"): a known label gives the status, anything else the nearest status with the
 * whole text kept as the stage label.
 */
export function parseStatusCell(text: string): {
  status: ApplicationStatus
  stageNote: string | null
  closedAtStage: ApplicationStatus | null
} {
  const value = text.trim()
  const cut = value.indexOf(STAGE_SEPARATOR.trim())
  const head = (cut >= 0 ? value.slice(0, cut) : value).trim()
  const stage = cut >= 0 ? value.slice(cut + 1).trim() || null : null
  const closed = /^(.*?)\s*\((?:po etapie|after stage):\s*(.+?)\)$/i.exec(head)
  const known = statusFromLabel(closed ? closed[1] : head)
  if (known) {
    return {
      status: known,
      stageNote: stage,
      closedAtStage: closed ? statusFromLabel(closed[2]) : null,
    }
  }
  if (!value) return { status: "APPLIED", stageNote: null, closedAtStage: null }
  const folded = fold(value)
  const guess = STATUS_WORDS.find(([pattern]) => pattern.test(folded))?.[1] ?? "APPLIED"
  return { status: guess, stageNote: value, closedAtStage: null }
}

const NEXT_LINE = /^(?:nast[eę]pny krok|next step)\s*:\s*(.*)$/i
const STAGE_LINE = /^(?:etap|stage)\s*:\s*(.*)$/i
const CLOSED_LINE = /^(?:po etapie|after stage)\s*:\s*(.*)$/i
const TRAILING_DAY = /\s*\(([^()]+)\)\s*$/

function stepWithDay(text: string): { nextStep: string | null; nextStepAt: string | null } {
  const day = TRAILING_DAY.exec(text)
  const when = day ? parseDay(day[1]) : null
  const step = (when ? text.slice(0, day!.index) : text).trim()
  return { nextStep: step || null, nextStepAt: when }
}

/**
 * "Po etapie: …", "Etap: …" and "Następny krok: Rozmowa z CTO (05.11.2026)" lines at the top, in
 * any order, notes below; anything else is notes. A stage line that is not there stays undefined,
 * so an older sheet with the stage in the Status cell keeps it.
 */
export function parseNextCell(text: string): {
  nextStep: string | null
  nextStepAt: string | null
  notes: string | null
  stageNote?: string | null
  closedAtStage?: ApplicationStatus | null
} {
  const lines = text.replace(/\r\n?/g, "\n").split("\n")
  const out: ReturnType<typeof parseNextCell> = { nextStep: null, nextStepAt: null, notes: null }
  let index = 0
  for (; index < lines.length; index++) {
    const line = lines[index].trim()
    const next = NEXT_LINE.exec(line)
    const stage = STAGE_LINE.exec(line)
    const closed = CLOSED_LINE.exec(line)
    if (next) Object.assign(out, stepWithDay(next[1]))
    else if (stage) out.stageNote = stage[1].trim() || null
    else if (closed) out.closedAtStage = statusFromLabel(closed[1])
    else break
  }
  out.notes = lines.slice(index).join("\n").trim() || null
  return out
}

function httpUrl(value: string | null | undefined): string | null {
  const text = (value ?? "").trim()
  return offerSite(text) ? text : null
}

function clean(value: string): string | null {
  const text = unsafeCell(value ?? "").trim()
  return text ? text : null
}

export type ReadRow = {
  id: string | null
  editedAt: Date | null
  fields: SheetFields
}

/**
 * One sheet row or CSV line as application fields. `link` is the link on the role cell of a sheet
 * row (null: none); a CSV has no such link (undefined). Null for an empty row. A column that is
 * missing leaves its field out, so it never clears anything.
 */
export function readRow(
  keys: (ReadKey | null)[],
  cells: string[],
  link?: string | null
): ReadRow | null {
  const fields: SheetFields = {}
  let id: string | null = null
  let editedAt: Date | null = null
  let any = false
  // Stage lines in the next-step cell win over the Status cell, whichever column comes first.
  let stageLines: Pick<SheetFields, "stageNote" | "closedAtStage"> = {}
  keys.forEach((key, index) => {
    if (!key) return
    const raw = cells[index] ?? ""
    const value = clean(String(raw))
    if (value && key !== "lp" && key !== "id" && key !== "edited") any = true
    switch (key) {
      case "applied": {
        const day = parseDay(value)
        if (day || !value) fields.appliedAt = day
        break
      }
      case "company":
        fields.company = value
        break
      case "title":
        fields.title = value
        break
      case "place":
        fields.location = value
        break
      case "origin":
        fields.origin = value
        break
      case "status": {
        const parsed = parseStatusCell(value ?? "")
        fields.status = parsed.status
        fields.stageNote = parsed.stageNote
        fields.closedAtStage = parsed.closedAtStage
        break
      }
      case "stage":
        fields.stageNote = value
        break
      case "closedAt":
        fields.closedAtStage = value ? statusFromLabel(value) : null
        break
      case "offerSalary":
        fields.salaryText = value
        break
      case "mySalary":
        fields.statedSalary = value
        break
      case "next": {
        const { stageNote, closedAtStage, ...next } = parseNextCell(value ?? "")
        Object.assign(fields, next)
        stageLines = { stageNote, closedAtStage }
        break
      }
      case "nextOnly":
        Object.assign(fields, stepWithDay(value ?? ""))
        break
      case "due": {
        const day = parseDay(value)
        if (day || !value) fields.nextStepAt = day
        break
      }
      case "notes":
        fields.notes = value
        break
      case "contact":
        fields.contact = value
        break
      case "link":
        fields.url = httpUrl(value)
        break
      case "id":
        id = value
        break
      case "edited": {
        const when = value ? new Date(value) : null
        editedAt = when && !Number.isNaN(when.getTime()) ? when : null
        break
      }
    }
  })
  if (!any) return null
  if (stageLines.stageNote !== undefined) fields.stageNote = stageLines.stageNote
  if (stageLines.closedAtStage !== undefined) fields.closedAtStage = stageLines.closedAtStage
  if (link !== undefined && fields.url === undefined) fields.url = httpUrl(link)
  return { id, editedAt, fields }
}

/** A fingerprint of the compared fields, to tell whether a row changed since it was written. */
export function fieldsHash(fields: SheetFields, keys: (keyof SheetFields)[]): string {
  const values = keys.map((key) => fields[key] ?? null)
  return createHash("sha1").update(JSON.stringify(values)).digest("hex")
}

/**
 * The fields of an application exactly as a sheet row reads them back: what newrole.it wrote, so
 * a row nobody touched hashes the same.
 */
export function writtenFields(
  app: SheetApplication,
  opts: { locale?: SheetLocale; includeNotes?: boolean } = {}
): SheetFields {
  const table = buildSheetTable([app], { ...opts, target: "sheet" })
  if (!table.rows.length) return {}
  return readRow(readHeader(table.header), table.rows[0], app.url)?.fields ?? {}
}

/** RFC 4180: quoted only when needed, quotes doubled, CRLF line ends. */
export function toCsv(table: { header: string[]; rows: string[][] }): string {
  const field = (value: string) => {
    const text = value ?? ""
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [table.header, ...table.rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n"
}

/**
 * RFC 4180 the other way, plus what spreadsheets export: a BOM, a semicolon or tab separator
 * (picked from the header line), LF or CRLF. Rows of blank cells are dropped.
 */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, "")
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ""
  const counts = [",", ";", "\t"].map((sep) => [sep, firstLine.split(sep).length] as const)
  const separator = counts.sort((a, b) => b[1] - a[1])[0][0]
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        cell += char
      }
    } else if (char === '"' && cell === "") {
      quoted = true
    } else if (char === separator) {
      row.push(cell)
      cell = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ""
    } else {
      cell += char
    }
  }
  if (cell !== "" || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((value) => value.trim() !== ""))
}
