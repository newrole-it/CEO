import {
  STAGE_RECORDING_STATUSES,
  statusLabel,
  type ApplicationSource,
} from "src/shared/applications"
import { compareApplications } from "./logic"

/** The applications table as the sheet and the CSV export show it. Pure, no database. */

export type SheetLocale = "pl" | "en"
export type SheetTable = { header: string[]; rows: string[][] }

export const SHEET_NAME = "Aplikacje"

type Column =
  | "company"
  | "title"
  | "status"
  | "stage"
  | "closedAt"
  | "applied"
  | "inStage"
  | "nextStep"
  | "due"
  | "contact"
  | "location"
  | "salary"
  | "stated"
  | "source"
  | "link"
  | "notes"
  | "updated"

const HEADERS: Record<SheetLocale, Record<Column, string>> = {
  pl: {
    company: "Firma",
    title: "Stanowisko",
    status: "Status",
    stage: "Etap",
    closedAt: "Odrzucono po",
    applied: "Aplikowano",
    inStage: "W etapie od",
    nextStep: "Następny krok",
    due: "Termin",
    contact: "Kontakt",
    location: "Lokalizacja",
    salary: "Wynagrodzenie",
    stated: "Podane widełki",
    source: "Źródło",
    link: "Link",
    notes: "Notatki",
    updated: "Ostatnia zmiana",
  },
  en: {
    company: "Company",
    title: "Role",
    status: "Status",
    stage: "Stage",
    closedAt: "Closed after",
    applied: "Applied",
    inStage: "In stage since",
    nextStep: "Next step",
    due: "Due",
    contact: "Contact",
    location: "Location",
    salary: "Salary",
    stated: "Stated salary",
    source: "Source",
    link: "Link",
    notes: "Notes",
    updated: "Last change",
  },
}

const SOURCES: Record<SheetLocale, Record<ApplicationSource, string>> = {
  pl: {
    nowarola: "Nowa Rola",
    extension: "Rozszerzenie",
    manual: "Ręcznie",
    mcp: "Claude (MCP)",
    gmail: "Gmail",
  },
  en: {
    nowarola: "Nowa Rola",
    extension: "Extension",
    manual: "Manual",
    mcp: "Claude (MCP)",
    gmail: "Gmail",
  },
}

export function sourceLabel(source: string, locale: SheetLocale = "pl"): string {
  return SOURCES[locale][source as ApplicationSource] ?? source
}

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

/**
 * Text that a spreadsheet would run as a formula ("=IMPORTXML(…)" in a crawled job title) gets
 * a leading apostrophe, which Sheets hides and keeps as plain text.
 */
export function safeCell(value: string | null | undefined): string {
  const text = (value ?? "").replace(/\r\n?/g, "\n")
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d[\d\s.,]*$/.test(text)) return `'${text}`
  return text
}

export type SheetApplication = {
  company: string
  title: string
  status: string
  stageNote: string | null
  closedAtStage: string | null
  appliedAt: Date
  statusChangedAt: Date
  nextStep: string | null
  nextStepAt: Date | null
  contact: string | null
  location: string | null
  salaryText: string | null
  statedSalary: string | null
  source: string
  url: string | null
  notes: string | null
  updatedAt: Date
}

export function buildSheetTable(
  apps: SheetApplication[],
  opts: { locale?: SheetLocale; includeNotes?: boolean } = {}
): SheetTable {
  const locale = opts.locale ?? "pl"
  const columns: Column[] = [
    "company",
    "title",
    "status",
    "stage",
    "closedAt",
    "applied",
    "inStage",
    "nextStep",
    "due",
    "contact",
    "location",
    "salary",
    "stated",
    "source",
    "link",
    ...(opts.includeNotes === false ? [] : (["notes"] as Column[])),
    "updated",
  ]
  const header = columns.map((column) => HEADERS[locale][column])
  const cell = (app: SheetApplication, column: Column): string => {
    switch (column) {
      case "company":
        return app.company
      case "title":
        return app.title
      case "status":
        return statusLabel(app.status, locale)
      case "stage":
        return app.stageNote ?? ""
      case "closedAt":
        return (STAGE_RECORDING_STATUSES as readonly string[]).includes(app.status) &&
          app.closedAtStage
          ? statusLabel(app.closedAtStage, locale)
          : ""
      case "applied":
        return sheetDate(app.appliedAt)
      case "inStage":
        return sheetDate(app.statusChangedAt)
      case "nextStep":
        return app.nextStep ?? ""
      case "due":
        return sheetDate(app.nextStepAt)
      case "contact":
        return app.contact ?? ""
      case "location":
        return app.location ?? ""
      case "salary":
        return app.salaryText ?? ""
      case "stated":
        return app.statedSalary ?? ""
      case "source":
        return sourceLabel(app.source, locale)
      case "link":
        return app.url ?? ""
      case "notes":
        return app.notes ?? ""
      case "updated":
        return sheetDate(app.updatedAt)
    }
  }
  const rows = [...apps]
    .sort(compareApplications)
    .map((app) => columns.map((column) => safeCell(cell(app, column))))
  return { header, rows }
}

/** RFC 4180: quoted only when needed, quotes doubled, CRLF line ends. */
export function toCsv(table: { header: string[]; rows: string[][] }): string {
  const field = (value: string) => {
    const text = value ?? ""
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return [table.header, ...table.rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n"
}
