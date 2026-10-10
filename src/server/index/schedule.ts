import type { JobStatus } from "@prisma/client"

/** Missing jobs step active → possibly closed → closed. A job that reappears is active again. */
export function nextStatus(current: JobStatus, seen: boolean): JobStatus | null {
  if (seen) return current === "ACTIVE" ? null : "ACTIVE"
  if (current === "CLOSED") return null
  if (current === "ACTIVE") return "POSSIBLY_CLOSED"
  if (current === "POSSIBLY_CLOSED") return "CLOSED"
  return null
}

/** Complete boards refresh daily. A capped career site continues the next UTC day. An unfinished board stays due so the catalog backfill can resume. */
export function nextCrawlAt(now: Date, complete: boolean, budgetExhausted: boolean): Date {
  if (budgetExhausted) {
    const next = new Date(now)
    next.setUTCDate(next.getUTCDate() + 1)
    next.setUTCHours(0, 15, 0, 0)
    return next
  }
  if (complete) return new Date(now.getTime() + 24 * 60 * 60 * 1000)
  return now
}
