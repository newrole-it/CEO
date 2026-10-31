import { fold } from "matching/text"
import {
  APPLICATION_SOURCES,
  APPLICATION_STATUSES,
  ACTIVE_STATUSES,
  CLOSED_STATUSES,
  gotResponse,
  isActiveStatus,
  isApplicationStatus,
  type ApplicationSource,
  type ApplicationStatus,
  type Channel,
} from "src/shared/applications"
import type { ApplicationEventType, ApplicationGroup, ApplicationStats, FormAnswer } from "./types"

/** Pure rules of the tracker: no database here, so everything is unit-testable. */

export const LIMITS = {
  company: 200,
  title: 300,
  url: 2000,
  location: 200,
  salaryText: 120,
  statedSalary: 200,
  stageNote: 160,
  nextStep: 300,
  contact: 500,
  notes: 20_000,
  note: 4000,
} as const

export type ApplicationErrorCode =
  | "not-found"
  | "job-not-found"
  | "cv-not-found"
  | "missing-fields"
  | "invalid-status"
  | "invalid-url"
  | "invalid-date"

export class ApplicationError extends Error {
  code: ApplicationErrorCode
  constructor(code: ApplicationErrorCode, message: string) {
    super(message)
    this.name = "ApplicationError"
    this.code = code
  }
}

/** Query parameters that name the posting itself. Everything else (utm_*, ref…) is noise. */
const POSTING_PARAMS = new Set([
  "gh_jid",
  "ashby_jid",
  "jid",
  "job",
  "jobid",
  "job_id",
  "id",
  "reqid",
  "req_id",
  "requisitionid",
  "requisition_id",
  "positionid",
  "position_id",
  "vacancyid",
  "vacancy_id",
  // LinkedIn's search page: /jobs/search/?currentJobId=123
  "currentjobid",
])

/**
 * Lowercased host without "www." + path without hash or trailing slashes, e.g.
 * "jobs.eu.lever.co/olx/5827a97c-…", plus the query parameters that name the posting, so
 * career pages like /careers?gh_jid=123 stay separate jobs. The SQL backfill in
 * db/migrations/20261029120000_applications_cv_answers drops the query altogether; offers
 * from the index are matched by jobId first, so that difference does not create duplicates.
 * Null for anything but http(s).
 */
export function urlKey(url: string): string | null {
  if (typeof url !== "string") return null
  const raw = url.trim()
  if (!raw) return null
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
  const host = parsed.host.toLowerCase().replace(/^www\./, "")
  if (!host) return null
  const path = parsed.pathname.replace(/\/+$/, "")
  const posting = [...parsed.searchParams]
    .map(([name, value]) => [name.toLowerCase(), value.trim()])
    .filter(([name, value]) => POSTING_PARAMS.has(name) && value)
    .map(([name, value]) => `${name}=${value}`)
    .sort()
  return `${host}${path}${posting.length ? `?${posting.join("&")}` : ""}`.toLowerCase()
}

/** A usable http(s) URL, trimmed, or null. */
export function cleanUrl(value: string | null | undefined): string | null {
  const text = cleanText(value, LIMITS.url)
  if (!text) return null
  return urlKey(text) ? text : null
}

/** Single line, single-spaced, capped; blank becomes null. */
export function cleanText(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const text = String(value).replace(/\s+/g, " ").trim().slice(0, max).trim()
  return text || null
}

/** Keeps line breaks (notes), trims the ends, caps the length; blank becomes null. */
export function cleanMultiline(value: string | null | undefined, max: number): string | null {
  if (value == null) return null
  const text = String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+$/gm, "")
    .trim()
    .slice(0, max)
  return text.trim() ? text : null
}

export function isSource(value: unknown): value is ApplicationSource {
  return typeof value === "string" && (APPLICATION_SOURCES as readonly string[]).includes(value)
}

export function asStatus(value: string | null | undefined): ApplicationStatus | null {
  return isApplicationStatus(value) ? value : null
}

/** "20 000–30 000 PLN" from the indexed offer's numbers. */
export function formatSalary(
  min: number | null | undefined,
  max: number | null | undefined,
  currency: string | null | undefined
): string | null {
  const nums = [min, max].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0
  )
  if (!nums.length) return null
  const format = (value: number) =>
    new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 0 })
      .format(Math.round(value))
      .replace(/[  ]/g, " ")
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const range = lo === hi ? format(lo) : `${format(lo)}–${format(hi)}`
  return `${range}${currency ? ` ${currency.toUpperCase()}` : ""}`
}

const OFFER_FIELDS = ["company", "title", "location", "salaryText"] as const

type OfferFields = Partial<Record<(typeof OFFER_FIELDS)[number], string | null>>

/**
 * The add form after a link was read. A field takes the new value unless the person typed over
 * what the previous link filled, so changing the link never keeps the old offer's company.
 */
export function refillForm<T extends Record<(typeof OFFER_FIELDS)[number], string>>(
  form: T,
  previous: OfferFields | null,
  next: OfferFields | null
): T {
  const out = { ...form }
  for (const field of OFFER_FIELDS) {
    const current = form[field]
    if (!current || current === (previous?.[field] ?? "")) {
      out[field] = (next?.[field] ?? "") as T[typeof field]
    }
  }
  return out
}

/** The stored form. Anything that is not a list of answers reads as an empty form. */
export function parseFormAnswers(value: unknown): FormAnswer[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const { question, answer, kind } = (item ?? {}) as Record<string, unknown>
    if (typeof question !== "string" || typeof answer !== "string") return []
    return [{ question, answer, kind: typeof kind === "string" ? kind : null }]
  })
}

/** Two labels for the same question: ignores case, accents, spacing and punctuation. */
export function answerKey(question: string): string {
  return fold(question)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

/** A form sent again overwrites the questions it repeats and keeps the others. */
export function mergeFormAnswers(previous: FormAnswer[], next: FormAnswer[]): FormAnswer[] {
  const merged = new Map(previous.map((item) => [answerKey(item.question), item]))
  for (const item of next) merged.set(answerKey(item.question), item)
  return [...merged.values()]
}

/** What the drawer lists: the form as sent, then bank answers linked by hand or by older forms. */
export function applicationAnswers(
  form: FormAnswer[],
  linked: { id: string; question: string; answer: string }[]
): { id: string; question: string; answer: string }[] {
  const asked = new Set(form.map((item) => answerKey(item.question)))
  return [
    ...form.map(({ question, answer }, index) => ({ id: `form-${index}`, question, answer })),
    ...linked.filter((item) => !asked.has(answerKey(item.question))),
  ]
}

const RANGE_LOW = /\b(min\w*|from|od|lower)\b/
const RANGE_HIGH = /\b(max\w*|to|do|upper)\b/

/**
 * The salary given in a form. A yes to "do you accept 20-25k?" has no number, so it does not
 * count. Separate minimum and maximum fields become one range; other fields stay side by side.
 */
export function statedSalaryFrom(form: FormAnswer[]): string | null {
  const stated = form.filter((item) => item.kind === "salary" && /\d/.test(item.answer))
  if (!stated.length) return null
  const values = [...new Set(stated.map((item) => item.answer.replace(/\s+/g, " ").trim()))]
  const range =
    stated.length === 2 &&
    RANGE_LOW.test(fold(stated[0].question)) &&
    RANGE_HIGH.test(fold(stated[1].question))
  return cleanText(values.join(range ? " – " : " · "), LIMITS.statedSalary)
}

/** Where a closed application stopped: the last active stage, kept across closed → closed. */
export function nextClosedAtStage(
  previous: string,
  previousClosedAt: string | null,
  next: ApplicationStatus
): ApplicationStatus | null {
  if (isActiveStatus(next)) return null
  if (isActiveStatus(previous)) return previous as ApplicationStatus
  return asStatus(previousClosedAt)
}

export type CurrentApplication = {
  status: string
  stageNote: string | null
  closedAtStage: string | null
  nextStep: string | null
  nextStepAt: Date | null
  contact: string | null
  notes: string | null
  company: string
  title: string
  url: string | null
  location: string | null
  salaryText: string | null
  statedSalary: string | null
  appliedAt: Date
  cvDocumentId: string | null
}

export type ApplicationPatch = {
  status?: ApplicationStatus
  stageNote?: string | null
  nextStep?: string | null
  nextStepAt?: Date | null
  contact?: string | null
  notes?: string | null
  company?: string
  title?: string
  url?: string | null
  location?: string | null
  salaryText?: string | null
  statedSalary?: string | null
  appliedAt?: Date
  cvDocumentId?: string | null
}

export type PlannedEvent = {
  type: ApplicationEventType
  fromStatus?: ApplicationStatus | null
  toStatus?: ApplicationStatus | null
  note?: string | null
}

export type PlannedUpdate = {
  data: Partial<CurrentApplication> & { urlKey?: string | null; statusChangedAt?: Date }
  events: PlannedEvent[]
  /** Field names that changed outside status and next step (the "edit" event) */
  edited: string[]
}

function sameTime(a: Date | null, b: Date | null): boolean {
  return (a?.getTime() ?? null) === (b?.getTime() ?? null)
}

function isoDay(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null
}

/** Timeline text for a next step: "Rozmowa z CTO · 2026-11-03". */
export function nextStepNote(step: string | null, at: Date | null): string | null {
  return [step, isoDay(at)].filter(Boolean).join(" · ") || null
}

/**
 * What to write for an update and which timeline events it produces. A status change writes a
 * `status` event (note = stage label), resets the stage label unless a new one is given and
 * records closedAtStage; next-step changes write `next-step`; everything else one `edit`.
 */
export function planUpdate(
  current: CurrentApplication,
  input: ApplicationPatch,
  now: Date
): PlannedUpdate {
  const data: PlannedUpdate["data"] = {}
  const events: PlannedEvent[] = []
  const edited: string[] = []

  if (input.status !== undefined && !isApplicationStatus(input.status)) {
    throw new ApplicationError("invalid-status", `Unknown status: ${String(input.status)}`)
  }
  const stageNote =
    input.stageNote !== undefined ? cleanText(input.stageNote, LIMITS.stageNote) : undefined

  if (input.status !== undefined && input.status !== current.status) {
    const from = asStatus(current.status)
    data.status = input.status
    data.statusChangedAt = now
    const closedAt = nextClosedAtStage(current.status, current.closedAtStage, input.status)
    if (closedAt !== current.closedAtStage) data.closedAtStage = closedAt
    const label = stageNote !== undefined ? stageNote : null
    if (label !== current.stageNote) data.stageNote = label
    events.push({ type: "status", fromStatus: from, toStatus: input.status, note: label })
  } else if (stageNote !== undefined && stageNote !== current.stageNote) {
    data.stageNote = stageNote
    edited.push("stageNote")
  }

  const step =
    input.nextStep !== undefined ? cleanText(input.nextStep, LIMITS.nextStep) : current.nextStep
  const stepAt = input.nextStepAt !== undefined ? input.nextStepAt : current.nextStepAt
  if (step !== current.nextStep || !sameTime(stepAt, current.nextStepAt)) {
    if (step !== current.nextStep) data.nextStep = step
    if (!sameTime(stepAt, current.nextStepAt)) data.nextStepAt = stepAt
    events.push({ type: "next-step", note: nextStepNote(step, stepAt) })
  }

  const text = (key: "contact" | "location" | "salaryText" | "statedSalary", max: number) => {
    if (input[key] === undefined) return
    const value = cleanText(input[key], max)
    if (value !== current[key]) {
      data[key] = value
      edited.push(key)
    }
  }
  const required = (key: "company" | "title", max: number) => {
    if (input[key] === undefined) return
    const value = cleanText(input[key], max)
    if (!value) throw new ApplicationError("missing-fields", `${key} cannot be empty.`)
    if (value !== current[key]) {
      data[key] = value
      edited.push(key)
    }
  }
  required("company", LIMITS.company)
  required("title", LIMITS.title)
  text("contact", LIMITS.contact)
  text("location", LIMITS.location)
  text("salaryText", LIMITS.salaryText)
  text("statedSalary", LIMITS.statedSalary)

  if (input.notes !== undefined) {
    const notes = cleanMultiline(input.notes, LIMITS.notes)
    if (notes !== current.notes) {
      data.notes = notes
      edited.push("notes")
    }
  }
  if (input.url !== undefined) {
    const raw = cleanText(input.url, LIMITS.url)
    if (raw && !urlKey(raw))
      throw new ApplicationError("invalid-url", "The link must be an http(s) URL.")
    if (raw !== current.url) {
      data.url = raw
      data.urlKey = raw ? urlKey(raw) : null
      edited.push("url")
    }
  }
  if (input.appliedAt !== undefined && !sameTime(input.appliedAt, current.appliedAt)) {
    data.appliedAt = input.appliedAt
    edited.push("appliedAt")
  }
  if (input.cvDocumentId !== undefined && (input.cvDocumentId || null) !== current.cvDocumentId) {
    data.cvDocumentId = input.cvDocumentId || null
    edited.push("cvDocumentId")
  }
  if (edited.length) events.push({ type: "edit", note: edited.join(", ") })
  return { data, events, edited }
}

export const EDIT_COALESCE_MS = 10 * 60_000

/**
 * Notes autosave every second while typing; a burst of edits from one channel becomes one
 * timeline entry. Returns the merged field list when the last event can absorb this edit.
 */
export function coalesceEdit(
  last: { type: string; channel: string; note: string | null; at: Date } | null,
  channel: Channel,
  fields: string[],
  now: Date
): string | null {
  if (!last || last.type !== "edit" || last.channel !== channel) return null
  if (now.getTime() - last.at.getTime() > EDIT_COALESCE_MS) return null
  const merged = new Set([
    ...(last.note ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    ...fields,
  ])
  return [...merged].join(", ")
}

/** Safe to delete when "Aplikowano" is undone: nothing was added after the click. */
export function isUntouched(
  app: {
    status: string
    notes: string | null
    nextStep: string | null
    nextStepAt: Date | null
    stageNote: string | null
    contact: string | null
  },
  events: { type: string }[],
  answers = 0
): boolean {
  if (app.status !== "APPLIED") return false
  if (app.notes?.trim() || app.nextStep?.trim() || app.stageNote?.trim() || app.contact?.trim())
    return false
  if (app.nextStepAt) return false
  if (answers > 0) return false
  return events.length === 1 && events[0].type === "created"
}

/** The statuses a filter group covers; null means all. */
export function groupStatuses(
  group: ApplicationGroup | undefined
): readonly ApplicationStatus[] | null {
  switch (group) {
    case "active":
      return ACTIVE_STATUSES
    case "closed":
      return CLOSED_STATUSES
    case "rejected":
      return ["REJECTED"]
    default:
      return null
  }
}

/** A reply came back. Withdrawing before anyone answered does not count. */
export function responded(row: { status: string; closedAtStage: string | null }): boolean {
  if (!gotResponse(row.status)) return false
  if (row.status === "WITHDRAWN" && (!row.closedAtStage || row.closedAtStage === "APPLIED"))
    return false
  return true
}

export function computeStats(
  rows: { status: string; closedAtStage: string | null; nextStepAt: Date | null }[],
  now: Date
): ApplicationStats {
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((status) => [status, 0])) as Record<
    ApplicationStatus,
    number
  >
  const closedAt: Partial<Record<ApplicationStatus, number>> = {}
  let replied = 0
  let overdue = 0
  for (const row of rows) {
    if (isApplicationStatus(row.status)) byStatus[row.status] += 1
    if (responded(row)) replied += 1
    if (
      (row.status === "REJECTED" || row.status === "WITHDRAWN") &&
      isApplicationStatus(row.closedAtStage)
    ) {
      closedAt[row.closedAtStage] = (closedAt[row.closedAtStage] ?? 0) + 1
    }
    if (isActiveStatus(row.status) && row.nextStepAt && row.nextStepAt.getTime() < startOfDay(now))
      overdue += 1
  }
  const sum = (statuses: readonly ApplicationStatus[]) =>
    statuses.reduce((total, status) => total + byStatus[status], 0)
  return {
    total: rows.length,
    active: sum(ACTIVE_STATUSES),
    interviewing: sum(["SCREENING", "INTERVIEW", "TASK", "FINAL"]),
    offers: sum(["OFFER", "ACCEPTED"]),
    rejected: byStatus.REJECTED,
    responseRate: rows.length ? replied / rows.length : null,
    overdue,
    byStatus,
    closedAt,
  }
}

/** Midnight in Warsaw is close enough for "overdue": anything before today counts. */
function startOfDay(now: Date): number {
  const day = new Date(now)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Funnel order (active first), then the newest application first. */
export function compareApplications(
  a: { status: string; appliedAt: Date },
  b: { status: string; appliedAt: Date }
): number {
  const rank = (status: string) => {
    const index = (APPLICATION_STATUSES as readonly string[]).indexOf(status)
    return index < 0 ? APPLICATION_STATUSES.length : index
  }
  return rank(a.status) - rank(b.status) || b.appliedAt.getTime() - a.appliedAt.getTime()
}

/** Case- and diacritics-insensitive "contains" on company and role. */
export function matchesQuery(
  row: { company: string; title: string },
  q: string | undefined
): boolean {
  const needle = fold(q?.trim() ?? "")
  if (!needle) return true
  const hay = fold(`${row.company} ${row.title}`)
  return needle.split(/\s+/).every((word) => hay.includes(word))
}

/**
 * Ranks applications for "na jakim etapie jestem z Allegro?": company match first, then the
 * role. Returns only rows that match at all, best first.
 */
export function rankByName<T extends { company: string; title: string; appliedAt: Date }>(
  rows: T[],
  query: { company?: string; title?: string; q?: string }
): T[] {
  const words = (value?: string) =>
    fold(value ?? "")
      .split(/[^\p{L}\p{N}+#.]+/u)
      .filter((word) => word.length > 1)
  const company = fold(query.company?.trim() ?? "")
  const titleWords = words(query.title)
  const freeWords = words(query.q)
  const scored = rows
    .map((row) => {
      const co = fold(row.company)
      const title = fold(row.title)
      let score = 0
      if (company) {
        if (co === company) score += 100
        else if (co.startsWith(company) || company.startsWith(co)) score += 80
        else if (co.includes(company)) score += 60
        else return { row, score: -1 }
      }
      if (titleWords.length) {
        const hits = titleWords.filter((word) => title.includes(word)).length
        if (!hits && !company) return { row, score: -1 }
        score += Math.round((40 * hits) / titleWords.length)
      }
      if (freeWords.length) {
        const coHits = freeWords.filter((word) => co.includes(word)).length
        const titleHits = freeWords.filter((word) => title.includes(word)).length
        if (!coHits && !titleHits) return { row, score: -1 }
        score += coHits * 50 + titleHits * 20
      }
      return { row, score }
    })
    .filter((item) => item.score >= 0)
  scored.sort((a, b) => b.score - a.score || b.row.appliedAt.getTime() - a.row.appliedAt.getTime())
  return scored.map((item) => item.row)
}
