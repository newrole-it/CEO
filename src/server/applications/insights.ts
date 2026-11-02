import {
  ACTIVE_STATUSES,
  APPLICATION_SOURCES,
  CHANNELS,
  isActiveStatus,
  isApplicationStatus,
  type ApplicationSource,
  type ApplicationStatus,
  type Channel,
} from "src/shared/applications"
import { computeStats, responded } from "./logic"
import type { ApplicationStats } from "./types"

/**
 * Statistics of the whole process: offers → applications → interviews → offers of work.
 * Pure functions over plain rows (dates as ISO strings), so the same code runs in unit tests,
 * on the server for MCP and in the browser when the person changes the range.
 */

export type InsightEvent = {
  type: string
  toStatus: string | null
  at: string
  channel: string
}

export type InsightApplication = {
  id: string
  company: string
  title: string
  status: string
  closedAtStage: string | null
  appliedAt: string
  statusChangedAt: string
  nextStep: string | null
  nextStepAt: string | null
  source: string
  /** Set when the offer is in the newrole.it index */
  jobId: string | null
  /** Oldest first */
  events: InsightEvent[]
}

/** One verdict on an offer in the feed. withReason: aspects or tags were given. */
export type InsightDecision = { verdict: string; createdAt: string; withReason: boolean }

export type InsightAnswer = { origin: string; useCount: number }

export type InsightsInput = {
  applications: InsightApplication[]
  decisions: InsightDecision[]
  answers: InsightAnswer[]
}

export type WeekPoint = {
  /** Monday 00:00 local time, ISO */
  weekStart: string
  /** Applications sent that week */
  sent: number
  /** Of those, how many have had any reply so far */
  sentReplied: number
  liked: number
  passed: number
  applied: number
}

export type FunnelStage = {
  stage: ApplicationStatus
  /** Applications that got to this stage or further, including ones that closed later */
  reached: number
  /** Applications in this stage right now */
  current: number
  /** reached / reached of the previous stage; null for the first stage */
  fromPrevious: number | null
}

export type DropOff = { stage: ApplicationStatus; rejected: number; withdrawn: number }

export type SourceRow = {
  source: ApplicationSource
  sent: number
  replied: number
  /** Reached INTERVIEW or further */
  interviewing: number
  responseRate: number | null
}

export type WaitingRow = { id: string; company: string; title: string; days: number }

export type UpcomingRow = {
  id: string
  company: string
  title: string
  nextStep: string | null
  nextStepAt: string
  overdue: boolean
}

export type Insights = {
  /** Start of the range (ISO) or null for everything */
  from: string | null
  /** Weeks the range spans (for the average per week) */
  spanWeeks: number
  /** The weekly series is capped; true when older weeks were left out of the chart */
  truncated: boolean
  totals: ApplicationStats
  sent: number
  perWeek: number | null
  funnel: FunnelStage[]
  outcomes: { accepted: number; rejected: number; withdrawn: number; ghosted: number }
  rates: { response: number | null; interview: number | null; offer: number | null }
  timing: { medianDaysToReply: number | null; medianDaysToRejection: number | null }
  weekly: WeekPoint[]
  dropOff: DropOff[]
  sources: SourceRow[]
  /** Applications whose offer is in the index */
  fromIndex: number
  /** Active, still without a reply for WAITING_DAYS or more; longest first. Not range-scoped. */
  waiting: WaitingRow[]
  /** Next steps overdue or within UPCOMING_DAYS; soonest first. Not range-scoped. */
  upcoming: UpcomingRow[]
  decisions: { liked: number; passed: number; applied: number; withReason: number; total: number }
  automation: {
    tracked: number
    /** Added by the feed, the extension, Claude or Gmail rather than typed in */
    autoTracked: number
    /** Status changes by the channel that made them */
    byChannel: Record<Channel, number>
    answersTotal: number
    /** Answers reused at least once or drafted from the bank */
    answersReused: number
  }
}

const DAY = 86_400_000
export const WAITING_DAYS = 14
export const UPCOMING_DAYS = 7
export const MAX_CHART_WEEKS = 52
export const DEFAULT_WEEKS = 12
const LIST_LIMIT = 6

/** Monday 00:00 local time of the week that holds `at`. */
export function weekStart(at: Date | string | number): Date {
  const day = new Date(at)
  const offset = (day.getDay() + 6) % 7
  day.setHours(0, 0, 0, 0)
  day.setDate(day.getDate() - offset)
  return day
}

/** DST-safe: moves by whole local days. */
export function addWeeks(start: Date, weeks: number): Date {
  const out = new Date(start)
  out.setDate(out.getDate() + weeks * 7)
  return out
}

function startOfDay(at: Date): number {
  const day = new Date(at)
  day.setHours(0, 0, 0, 0)
  return day.getTime()
}

function weeksBetween(start: Date, end: Date): number {
  return Math.max(0, Math.round((startOfDay(end) - startOfDay(start)) / (7 * DAY)))
}

const STAGE_RANK = new Map<string, number>(ACTIVE_STATUSES.map((status, index) => [status, index]))

function stageRank(status: string | null | undefined): number {
  if (!status) return -1
  if (status === "ACCEPTED") return STAGE_RANK.get("OFFER") ?? -1
  return STAGE_RANK.get(status) ?? -1
}

/**
 * The furthest funnel stage an application got to, as an index into ACTIVE_STATUSES. Uses the
 * timeline first, then the current status and the stage a closed application stopped at, so
 * rows migrated without events still count.
 */
export function reachedStage(
  app: Pick<InsightApplication, "status" | "closedAtStage" | "events">
): number {
  let rank = 0
  for (const event of app.events) rank = Math.max(rank, stageRank(event.toStatus))
  rank = Math.max(rank, stageRank(app.status), stageRank(app.closedAtStage))
  return rank
}

/** Statuses that are not a reply from the company. */
const SILENT = new Set(["APPLIED", "GHOSTED", "WITHDRAWN"])

/** When the company first answered: the first move past APPLIED on the timeline. */
export function firstReplyAt(
  app: Pick<InsightApplication, "status" | "closedAtStage" | "statusChangedAt" | "events">
): Date | null {
  for (const event of app.events) {
    if (event.type !== "status" && event.type !== "created") continue
    if (event.toStatus && !SILENT.has(event.toStatus)) return new Date(event.at)
  }
  return responded(app) ? new Date(app.statusChangedAt) : null
}

function rejectedAt(app: InsightApplication): Date | null {
  if (app.status !== "REJECTED") return null
  for (let index = app.events.length - 1; index >= 0; index -= 1) {
    const event = app.events[index]
    if (event.type === "status" && event.toStatus === "REJECTED") return new Date(event.at)
  }
  return new Date(app.statusChangedAt)
}

function daysBetween(from: string | Date, to: Date): number {
  return Math.max(0, Math.round((to.getTime() - new Date(from).getTime()) / DAY))
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
  return Math.round(value)
}

function ratio(part: number, whole: number): number | null {
  return whole ? part / whole : null
}

function asSource(value: string): ApplicationSource {
  return (APPLICATION_SOURCES as readonly string[]).includes(value)
    ? (value as ApplicationSource)
    : "manual"
}

function asChannel(value: string): Channel {
  return (CHANNELS as readonly string[]).includes(value) ? (value as Channel) : "web"
}

export type InsightsOptions = {
  /** Applications sent in the last N weeks (this week included); null or 0 means everything */
  weeks?: number | null
  now?: Date
}

export function computeInsights(input: InsightsInput, opts: InsightsOptions = {}): Insights {
  const now = opts.now ?? new Date()
  const thisWeek = weekStart(now)
  const weeks = opts.weeks && opts.weeks > 0 ? Math.floor(opts.weeks) : null
  const from = weeks ? addWeeks(thisWeek, -(weeks - 1)) : null
  const inRange = (at: string) => !from || new Date(at).getTime() >= from.getTime()

  const apps = input.applications.filter((app) => inRange(app.appliedAt))
  const decisions = input.decisions.filter((row) => inRange(row.createdAt))

  // range span: for "everything" it starts with the oldest record
  const firstAt = [
    ...apps.map((app) => new Date(app.appliedAt).getTime()),
    ...decisions.map((row) => new Date(row.createdAt).getTime()),
  ].reduce<number | null>((min, value) => (min == null || value < min ? value : min), null)
  const spanStart = from ?? (firstAt != null ? weekStart(firstAt) : thisWeek)
  const spanWeeks = weeksBetween(spanStart, thisWeek) + 1
  const chartWeeks = Math.min(spanWeeks, MAX_CHART_WEEKS)
  const chartStart = addWeeks(thisWeek, -(chartWeeks - 1))
  const bucketIndex = new Map<number, number>()
  const weekly: WeekPoint[] = []
  for (let index = 0; index < chartWeeks; index += 1) {
    const start = addWeeks(chartStart, index)
    bucketIndex.set(start.getTime(), index)
    weekly.push({
      weekStart: start.toISOString(),
      sent: 0,
      sentReplied: 0,
      liked: 0,
      passed: 0,
      applied: 0,
    })
  }
  const bucket = (at: string): WeekPoint | null => {
    const index = bucketIndex.get(weekStart(at).getTime())
    return index == null ? null : weekly[index]
  }

  const totals = computeStats(
    apps.map((app) => ({
      status: app.status,
      closedAtStage: app.closedAtStage,
      nextStepAt: app.nextStepAt ? new Date(app.nextStepAt) : null,
    })),
    now
  )

  const reached = apps.map(reachedStage)
  const replies = apps.map((app) => (responded(app) ? firstReplyAt(app) : null))
  const funnel: FunnelStage[] = ACTIVE_STATUSES.map((stage, index) => {
    const count = reached.filter((rank) => rank >= index).length
    const previous = index ? reached.filter((rank) => rank >= index - 1).length : null
    return {
      stage,
      reached: count,
      current: apps.filter((app) => app.status === stage).length,
      fromPrevious: previous == null ? null : ratio(count, previous),
    }
  })
  const interviewRank = STAGE_RANK.get("INTERVIEW") ?? 2
  const offerRank = STAGE_RANK.get("OFFER") ?? 5

  const dropOff: DropOff[] = ACTIVE_STATUSES.map((stage) => ({ stage, rejected: 0, withdrawn: 0 }))
  for (const app of apps) {
    if (app.status !== "REJECTED" && app.status !== "WITHDRAWN") continue
    // a closing status with no recorded stage means the application never got past APPLIED
    const stage = isApplicationStatus(app.closedAtStage) ? app.closedAtStage : "APPLIED"
    const row = dropOff[Math.max(0, stageRank(stage))]
    if (app.status === "REJECTED") row.rejected += 1
    else row.withdrawn += 1
  }

  const sources: SourceRow[] = APPLICATION_SOURCES.map((source) => ({
    source,
    sent: 0,
    replied: 0,
    interviewing: 0,
    responseRate: null,
  }))
  const bySource = new Map(sources.map((row) => [row.source, row]))

  const byChannel = Object.fromEntries(CHANNELS.map((channel) => [channel, 0])) as Record<
    Channel,
    number
  >
  let autoTracked = 0
  let fromIndex = 0
  const replyDays: number[] = []
  const rejectionDays: number[] = []

  apps.forEach((app, index) => {
    const replied = replies[index] != null
    const sent = bucket(app.appliedAt)
    if (sent) {
      sent.sent += 1
      if (replied) sent.sentReplied += 1
    }
    const source = bySource.get(asSource(app.source))!
    source.sent += 1
    if (replied) source.replied += 1
    if (reached[index] >= interviewRank) source.interviewing += 1
    // Typed by hand somewhere: in the app, in the sheet or in a CSV.
    if (!["manual", "sheet", "csv"].includes(app.source)) autoTracked += 1
    if (app.jobId) fromIndex += 1
    for (const event of app.events) {
      if (event.type === "status") byChannel[asChannel(event.channel)] += 1
    }
    const reply = replies[index]
    if (reply) replyDays.push(daysBetween(app.appliedAt, reply))
    const rejected = rejectedAt(app)
    if (rejected) rejectionDays.push(daysBetween(app.appliedAt, rejected))
  })
  for (const row of sources) row.responseRate = ratio(row.replied, row.sent)

  for (const row of decisions) {
    const point = bucket(row.createdAt)
    if (!point) continue
    if (row.verdict === "LIKE") point.liked += 1
    else if (row.verdict === "DISLIKE") point.passed += 1
    else if (row.verdict === "APPLIED") point.applied += 1
  }

  const today = startOfDay(now)
  const waiting: WaitingRow[] = input.applications
    .filter((app) => app.status === "APPLIED")
    .map((app) => ({
      id: app.id,
      company: app.company,
      title: app.title,
      days: daysBetween(app.appliedAt, now),
    }))
    .filter((row) => row.days >= WAITING_DAYS)
    .sort((a, b) => b.days - a.days)
    .slice(0, LIST_LIMIT)

  const horizon = today + UPCOMING_DAYS * DAY
  const upcoming: UpcomingRow[] = input.applications
    .filter((app) => isActiveStatus(app.status) && app.nextStepAt)
    .map((app) => ({
      id: app.id,
      company: app.company,
      title: app.title,
      nextStep: app.nextStep,
      nextStepAt: new Date(app.nextStepAt!).toISOString(),
      overdue: new Date(app.nextStepAt!).getTime() < today,
    }))
    .filter((row) => new Date(row.nextStepAt).getTime() < horizon)
    .sort((a, b) => new Date(a.nextStepAt).getTime() - new Date(b.nextStepAt).getTime())
    .slice(0, LIST_LIMIT)

  const replied = replies.filter(Boolean).length
  return {
    from: from ? from.toISOString() : null,
    spanWeeks,
    truncated: chartWeeks < spanWeeks,
    totals,
    sent: apps.length,
    perWeek: apps.length ? Math.round((apps.length / spanWeeks) * 10) / 10 : null,
    funnel,
    outcomes: {
      accepted: totals.byStatus.ACCEPTED,
      rejected: totals.byStatus.REJECTED,
      withdrawn: totals.byStatus.WITHDRAWN,
      ghosted: totals.byStatus.GHOSTED,
    },
    rates: {
      response: ratio(replied, apps.length),
      interview: ratio(reached.filter((rank) => rank >= interviewRank).length, apps.length),
      offer: ratio(reached.filter((rank) => rank >= offerRank).length, apps.length),
    },
    timing: {
      medianDaysToReply: median(replyDays),
      medianDaysToRejection: median(rejectionDays),
    },
    weekly,
    dropOff: dropOff.filter((row) => row.rejected || row.withdrawn),
    sources: sources.filter((row) => row.sent > 0),
    fromIndex,
    waiting,
    upcoming,
    decisions: {
      liked: decisions.filter((row) => row.verdict === "LIKE").length,
      passed: decisions.filter((row) => row.verdict === "DISLIKE").length,
      applied: decisions.filter((row) => row.verdict === "APPLIED").length,
      withReason: decisions.filter((row) => row.withReason).length,
      total: decisions.length,
    },
    automation: {
      tracked: apps.length,
      autoTracked,
      byChannel,
      answersTotal: input.answers.length,
      answersReused: input.answers.filter((row) => row.useCount >= 2 || row.origin === "draft")
        .length,
    },
  }
}
