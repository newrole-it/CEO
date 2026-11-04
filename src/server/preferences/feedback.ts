import { Prisma } from "@prisma/client"
import db from "db"
import { fold } from "@newrole/matching/text"
import {
  ensureApplicationForJob,
  removeUntouchedApplicationForJob,
} from "src/server/applications/service"
import {
  FEEDBACK_VERDICTS,
  parseAspects,
  type FeedbackAspect,
  type FeedbackVerdict,
} from "src/shared/feedback-aspects"
import type { FeedbackChannel, OfferFeedbackView } from "./types"

export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 60
export const MAX_NOTE_LENGTH = 2000

export type FeedbackErrorCode = "invalid-verdict" | "job-not-found"

export class FeedbackError extends Error {
  code: FeedbackErrorCode
  constructor(code: FeedbackErrorCode, message: string) {
    super(message)
    this.name = "FeedbackError"
    this.code = code
  }
}

export function isVerdict(value: unknown): value is FeedbackVerdict {
  return typeof value === "string" && (FEEDBACK_VERDICTS as readonly string[]).includes(value)
}

/**
 * Stored tags hold two kinds of entries: what the person picked ("Kotlin", "100% zdalnie"),
 * and muted signal keys prefixed with "-" ("-skill:kotlin") written by dropSignal, which tell
 * the model to stop learning that fact from this offer.
 */
export const MUTE_PREFIX = "-"
const MAX_MUTED = 40

export function splitStoredTags(value: unknown): { tags: string[]; muted: string[] } {
  if (!Array.isArray(value)) return { tags: [], muted: [] }
  const strings = value.filter((item): item is string => typeof item === "string")
  const muted = [
    ...new Set(
      strings
        .filter((item) => item.startsWith(MUTE_PREFIX) && item.length > 1)
        .map((item) => item.slice(1).trim().slice(0, 120))
        .filter(Boolean)
    ),
  ].slice(-MAX_MUTED) // dropSignal appends, so the newest mutes are the ones at the end
  return { tags: cleanTags(strings.filter((item) => !item.startsWith(MUTE_PREFIX))), muted }
}

export function storedTags(tags: string[], muted: string[]): string[] {
  return [...tags, ...muted.map((key) => `${MUTE_PREFIX}${key}`)]
}

/** Trimmed, single-spaced, at most 60 characters each, case-insensitive dedupe, at most 12. */
export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const tag = item
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^-+\s*/, "")
      .slice(0, MAX_TAG_LENGTH)
      .trim()
    if (!tag) continue
    const key = fold(tag)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

export function cleanNote(value: string | null | undefined): string | null {
  if (value == null) return null
  const note = value.trim().slice(0, MAX_NOTE_LENGTH).trim()
  return note || null
}

/** What the older per-search JobMatch columns should say for a verdict (null = undecided). */
export function legacyMatchState(
  verdict: FeedbackVerdict | null,
  now: Date
): { interestedAt: Date | null; dismissedAt: Date | null } {
  if (verdict === "DISLIKE") return { interestedAt: null, dismissedAt: now }
  if (verdict === "LIKE" || verdict === "APPLIED") return { interestedAt: now, dismissedAt: null }
  return { interestedAt: null, dismissedAt: null }
}

/**
 * Fields for the upsert. Omitted aspects / tags / note keep what was saved when the verdict
 * is unchanged (a second "like" from the list must not wipe the chips), and reset when it
 * changes (what you liked is not why you passed). Muted keys always survive.
 */
export function mergeFeedback(
  previous: { verdict: string; aspects: unknown; tags: unknown; note: string | null } | null,
  input: { verdict: FeedbackVerdict; aspects?: unknown; tags?: unknown; note?: string | null }
): { aspects: FeedbackAspect[]; tags: string[]; note: string | null } {
  const keep = previous != null && previous.verdict === input.verdict
  const stored = splitStoredTags(previous?.tags)
  const tags = input.tags !== undefined ? cleanTags(input.tags) : keep ? stored.tags : []
  return {
    aspects:
      input.aspects !== undefined
        ? parseAspects(input.aspects)
        : keep
        ? parseAspects(previous!.aspects)
        : [],
    tags: storedTags(tags, stored.muted),
    note: input.note !== undefined ? cleanNote(input.note) : keep ? previous!.note : null,
  }
}

const viewSelect = {
  id: true,
  jobId: true,
  verdict: true,
  aspects: true,
  tags: true,
  note: true,
  channel: true,
  createdAt: true,
  updatedAt: true,
  job: {
    select: {
      title: true,
      originalUrl: true,
      canonicalUrl: true,
      status: true,
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.OfferFeedbackSelect

type ViewRow = Prisma.OfferFeedbackGetPayload<{ select: typeof viewSelect }>

export function toFeedbackView(row: ViewRow): OfferFeedbackView {
  const stored = splitStoredTags(row.tags)
  return {
    id: row.id,
    jobId: row.jobId,
    verdict: isVerdict(row.verdict) ? row.verdict : "LIKE",
    aspects: parseAspects(row.aspects),
    tags: stored.tags,
    muted: stored.muted,
    note: row.note,
    channel: row.channel === "mcp" ? "mcp" : "web",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    job: row.job
      ? {
          title: row.job.title,
          company: row.job.company.name,
          url: row.job.originalUrl || row.job.canonicalUrl,
          status: row.job.status,
        }
      : null,
  }
}

async function syncMatches(userId: number, jobId: string, verdict: FeedbackVerdict | null) {
  await db.jobMatch.updateMany({
    where: { jobId, savedSearch: { userId } },
    data: legacyMatchState(verdict, new Date()),
  })
}

/** One verdict per person and offer, across every search. Also mirrors it onto JobMatch rows. */
export async function recordFeedback(input: {
  userId: number
  jobId: string
  verdict: FeedbackVerdict
  aspects?: FeedbackAspect[]
  tags?: string[]
  note?: string | null
  channel?: FeedbackChannel
}): Promise<OfferFeedbackView> {
  if (!isVerdict(input.verdict)) {
    throw new FeedbackError("invalid-verdict", `Unknown verdict: ${String(input.verdict)}`)
  }
  const job = await db.job.findUnique({ where: { id: input.jobId }, select: { id: true } })
  if (!job) throw new FeedbackError("job-not-found", "This offer no longer exists.")
  const previous = await db.offerFeedback.findUnique({
    where: { userId_jobId: { userId: input.userId, jobId: input.jobId } },
    select: { verdict: true, aspects: true, tags: true, note: true },
  })
  const fields = mergeFeedback(previous, input)
  const channel: FeedbackChannel = input.channel === "mcp" ? "mcp" : "web"
  const row = await db.offerFeedback.upsert({
    where: { userId_jobId: { userId: input.userId, jobId: input.jobId } },
    create: {
      userId: input.userId,
      jobId: input.jobId,
      verdict: input.verdict,
      channel,
      ...fields,
    },
    update: { verdict: input.verdict, channel, ...fields },
    select: viewSelect,
  })
  await syncMatches(input.userId, input.jobId, input.verdict)
  await syncApplication(
    input.userId,
    input.jobId,
    previous?.verdict ?? null,
    input.verdict,
    channel
  )
  return toFeedbackView(row)
}

/** Back to undecided: removes the verdict and clears the JobMatch flags for that offer. */
export async function clearFeedback(userId: number, jobId: string): Promise<void> {
  const previous = await db.offerFeedback.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { verdict: true },
  })
  await db.offerFeedback.deleteMany({ where: { userId, jobId } })
  await syncMatches(userId, jobId, null)
  await syncApplication(userId, jobId, previous?.verdict ?? null, null, "web")
}

/**
 * Keeps the application tracker in step with "Aplikowano" (plan-aplikacje E1.5): applied creates
 * the application, undo removes it while nothing was added. Never fails the feedback itself.
 */
async function syncApplication(
  userId: number,
  jobId: string,
  previous: string | null,
  next: FeedbackVerdict | null,
  channel: FeedbackChannel
) {
  if (next !== "APPLIED" && previous !== "APPLIED") return
  try {
    if (next === "APPLIED") await ensureApplicationForJob(userId, jobId, channel)
    else await removeUntouchedApplicationForJob(userId, jobId)
  } catch (error) {
    console.error("Application tracker sync failed", error)
  }
}

export async function listFeedback(
  userId: number,
  opts: { verdict?: FeedbackVerdict; limit?: number } = {}
): Promise<OfferFeedbackView[]> {
  const take = Math.max(1, Math.min(500, Math.round(opts.limit ?? 100)))
  const rows = await db.offerFeedback.findMany({
    where: { userId, ...(opts.verdict ? { verdict: opts.verdict } : {}) },
    orderBy: { updatedAt: "desc" },
    take,
    select: viewSelect,
  })
  return rows.map(toFeedbackView)
}

export async function getFeedback(
  userId: number,
  jobId: string
): Promise<OfferFeedbackView | null> {
  const row = await db.offerFeedback.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: viewSelect,
  })
  return row ? toFeedbackView(row) : null
}
