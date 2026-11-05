import type { JobStatus } from "@prisma/client"

/** Missing jobs step active → possibly closed → closed. A job that reappears is active again. */
export function nextStatus(current: JobStatus, seen: boolean): JobStatus | null {
  if (seen) return current === "ACTIVE" ? null : "ACTIVE"
  if (current === "CLOSED") return null
  if (current === "ACTIVE") return "POSSIBLY_CLOSED"
  if (current === "POSSIBLY_CLOSED") return "CLOSED"
  return null
}

export type WatchedPageSlot = {
  id: string
  nextCheckAt: Date | null
  lastSuccessfulFetchAt: Date | null
  watchers: number
}

/**
 * Watched companies jump the seed queue. Never-read pages first, then the most
 * watched, then the longest overdue. Pages not yet due are skipped.
 */
export function pickWatchedPage<T extends WatchedPageSlot>(pages: T[], now: Date): T | null {
  const due = pages.filter((page) => !page.nextCheckAt || page.nextCheckAt <= now)
  due.sort((a, b) => {
    const fresh =
      Number(Boolean(a.lastSuccessfulFetchAt)) - Number(Boolean(b.lastSuccessfulFetchAt))
    if (fresh !== 0) return fresh
    if (a.watchers !== b.watchers) return b.watchers - a.watchers
    return (a.nextCheckAt?.getTime() ?? 0) - (b.nextCheckAt?.getTime() ?? 0)
  })
  return due[0] ?? null
}

/**
 * Complete boards refresh daily. A capped career site continues the next UTC day.
 * An unfinished board stays at the front of the queue until that cap, so a large
 * sitemap backfills in 200-page days instead of rotating away after one batch.
 */
export function nextCrawlAt(
  now: Date,
  complete: boolean,
  budgetExhausted: boolean,
  progressed = true
): Date {
  if (budgetExhausted) {
    const next = new Date(now)
    next.setUTCDate(next.getUTCDate() + 1)
    next.setUTCHours(0, 15, 0, 0)
    return next
  }
  if (complete) return new Date(now.getTime() + 24 * 60 * 60 * 1000)
  // An unfinished board that read nothing new would otherwise hold the front of the
  // queue forever and starve every other board's daily refresh.
  if (!progressed) return new Date(now.getTime() + STALLED_RETRY_MS)
  return new Date(0)
}

export const STALLED_RETRY_MS = 6 * 60 * 60 * 1000

/** A career site or watched page that failed or was unproven waits this long, not one loop pass. */
export const SOURCE_RETRY_MS = 6 * 60 * 60 * 1000
/** An API board that answered with an error is one cheap call, so it is retried sooner. */
export const BOARD_RETRY_MS = 15 * 60 * 1000
