import { isActiveStatus } from "src/shared/applications"
import type { InsightApplication } from "./insights"

/**
 * Which active applications are due a follow-up, and how urgent. Pure: plain rows with ISO dates
 * in, plain rows out, so the statistics page, the dashboard and MCP share one rule.
 *
 * The cadence follows career-ops' followup-cadence.mjs (applied: first after 7 days, then every 7,
 * at most 2, then cold; after a reply or an interview: every 3 days, no limit; a date the person
 * pinned wins over the computed one). One difference, forced by the data: newrole.it has no
 * record of a follow-up that was SENT (ApplicationEvent has no such type, and a note is free
 * text), so follow-ups cannot be counted. The cap is therefore a number of days, not a number of
 * messages: the day the second follow-up would have gone unanswered for a week
 * (7 + 7 × 2 = 21 days). What the timeline does hold, a note or a mail on the application, is
 * read as a sign of contact and restarts the wait.
 */
export const FOLLOWUP_RULES = {
  /** Days after applying before the first follow-up */
  appliedFirstDays: 7,
  /** Days of quiet between follow-ups while still APPLIED */
  appliedEveryDays: 7,
  /** Follow-ups worth sending before an application with no reply is called cold */
  appliedMaxFollowups: 2,
  /** Days of quiet after a reply (any stage past APPLIED) before asking what is next */
  afterReplyEveryDays: 3,
} as const

/** Days with no reply after which an APPLIED application is cold: suggest GHOSTED. */
export const COLD_AFTER_DAYS =
  FOLLOWUP_RULES.appliedFirstDays +
  FOLLOWUP_RULES.appliedEveryDays * FOLLOWUP_RULES.appliedMaxFollowups

const DAY = 86_400_000

/** Event types that show the person and the company were in touch. An edit of a field is not one. */
const CONTACT_EVENTS = new Set(["note", "mail"])

export type FollowupApplication = Pick<
  InsightApplication,
  | "id"
  | "company"
  | "title"
  | "status"
  | "appliedAt"
  | "statusChangedAt"
  | "nextStep"
  | "nextStepAt"
  | "events"
>

/**
 * waiting: nothing to do yet. due: the day has come. overdue: the day passed a whole cadence
 * step ago (or, for the person's own date, at all). cold: applied, silent past COLD_AFTER_DAYS.
 */
export type FollowupState = "waiting" | "due" | "overdue" | "cold"

/**
 * no-reply: applied, no answer. after-reply: past APPLIED, quiet since the last move.
 * own-date: the person set nextStepAt, which wins over the cadence.
 */
export type FollowupKind = "no-reply" | "after-reply" | "own-date"

export type FollowupRow = {
  id: string
  company: string
  title: string
  status: string
  state: FollowupState
  kind: FollowupKind
  /** The day the follow-up is (or was) due, local midnight, ISO */
  dueAt: string
  /** Whole days past dueAt; 0 on the day itself, negative while waiting */
  daysOverdue: number
  daysSinceApplied: number
  /** Whole days since the last move or contact on the timeline */
  daysQuiet: number
  nextStep: string | null
  /** Set for a cold application: the status to move it to */
  suggestStatus: "GHOSTED" | null
}

export type Followups = {
  /** Everything due, overdue or cold; most urgent first */
  rows: FollowupRow[]
  counts: { overdue: number; due: number; cold: number; total: number }
  /** Active applications not due yet */
  waiting: number
}

function startOfDay(at: Date | string | number): number {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

/** Whole local calendar days from one moment to another; DST-safe through rounding. */
export function calendarDays(from: Date | string | number, to: Date | string | number): number {
  return Math.round((startOfDay(to) - startOfDay(from)) / DAY)
}

function addDays(at: number, days: number): Date {
  const out = new Date(at)
  out.setDate(out.getDate() + days)
  return out
}

function latest(values: number[]): number {
  return values.reduce((max, value) => (value > max ? value : max), values[0])
}

/**
 * The follow-up state of one application at `now`, or null when it is not active (closed
 * applications have nobody to follow up with).
 */
export function followupFor(app: FollowupApplication, now: Date): FollowupRow | null {
  if (!isActiveStatus(app.status)) return null
  const applied = startOfDay(app.appliedAt)
  const daysSinceApplied = Math.max(0, calendarDays(applied, now))
  const contacts = app.events
    .filter((event) => CONTACT_EVENTS.has(event.type))
    .map((event) => startOfDay(event.at))
  const moves = app.events
    .filter((event) => event.type === "status")
    .map((event) => startOfDay(event.at))
  const afterReply = app.status !== "APPLIED"
  // an imported row can carry a status with no timeline, so statusChangedAt always counts
  const quietSince = afterReply
    ? latest([startOfDay(app.statusChangedAt), ...moves, ...contacts])
    : latest([applied, ...contacts])
  const daysQuiet = Math.max(0, calendarDays(quietSince, now))
  const base = {
    id: app.id,
    company: app.company,
    title: app.title,
    status: app.status,
    daysSinceApplied,
    daysQuiet,
    nextStep: app.nextStep,
  }

  if (app.nextStepAt) {
    const due = startOfDay(app.nextStepAt)
    const daysOverdue = calendarDays(due, now)
    return {
      ...base,
      kind: "own-date",
      state: daysOverdue < 0 ? "waiting" : daysOverdue === 0 ? "due" : "overdue",
      dueAt: new Date(due).toISOString(),
      daysOverdue,
      suggestStatus: null,
    }
  }

  const step = afterReply ? FOLLOWUP_RULES.afterReplyEveryDays : FOLLOWUP_RULES.appliedEveryDays
  const first = afterReply ? FOLLOWUP_RULES.afterReplyEveryDays : FOLLOWUP_RULES.appliedFirstDays
  // a contact after applying restarts the wait with the step between follow-ups
  const wait = !afterReply && quietSince === applied ? first : step
  const due = addDays(quietSince, wait)
  const daysOverdue = calendarDays(due, now)
  const cold = !afterReply && daysOverdue >= 0 && daysSinceApplied >= COLD_AFTER_DAYS
  const state: FollowupState =
    daysOverdue < 0 ? "waiting" : cold ? "cold" : daysOverdue >= step ? "overdue" : "due"
  return {
    ...base,
    kind: afterReply ? "after-reply" : "no-reply",
    state,
    dueAt: due.toISOString(),
    daysOverdue,
    suggestStatus: cold ? "GHOSTED" : null,
  }
}

const ORDER: Record<FollowupState, number> = { overdue: 0, due: 1, cold: 2, waiting: 3 }

/** The follow-up list: overdue first (longest overdue on top), then due, then cold. */
export function computeFollowups(
  applications: FollowupApplication[],
  opts: { now: Date }
): Followups {
  const all = applications.flatMap((app) => followupFor(app, opts.now) ?? [])
  const rows = all
    .filter((row) => row.state !== "waiting")
    .sort(
      (a, b) =>
        ORDER[a.state] - ORDER[b.state] ||
        b.daysOverdue - a.daysOverdue ||
        b.daysSinceApplied - a.daysSinceApplied ||
        a.id.localeCompare(b.id)
    )
  const count = (state: FollowupState) => rows.filter((row) => row.state === state).length
  return {
    rows,
    counts: {
      overdue: count("overdue"),
      due: count("due"),
      cold: count("cold"),
      total: rows.length,
    },
    waiting: all.length - rows.length,
  }
}
