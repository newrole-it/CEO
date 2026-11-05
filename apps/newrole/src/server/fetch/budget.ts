import db from "db"
import { DETAIL_DAILY_CAP } from "@newrole/ats/host"

/**
 * The daily cap of job-detail pages per host (/bot promises it), counted in Postgres so the web
 * app and the MCP server share it: @newrole/ats asks here through configureAts (src/server/fetch/ats.ts).
 */

export { DETAIL_DAILY_CAP }

const memory = new Map<string, { day: string; count: number }>()

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function takeMemory(host: string): boolean {
  const day = today()
  const current = memory.get(host)
  if (!current || current.day !== day) {
    memory.set(host, { day, count: 1 })
    return true
  }
  if (current.count >= DETAIL_DAILY_CAP) return false
  current.count += 1
  return true
}

export async function detailFetchesRemaining(host: string): Promise<number> {
  const day = today()
  if (process.env.VITEST) {
    const current = memory.get(host)
    if (!current || current.day !== day) return DETAIL_DAILY_CAP
    return Math.max(0, DETAIL_DAILY_CAP - current.count)
  }
  try {
    const existing = await db.crawlBudget.findUnique({ where: { host } })
    if (!existing || existing.day !== day) return DETAIL_DAILY_CAP
    return Math.max(0, DETAIL_DAILY_CAP - existing.detailFetches)
  } catch {
    const current = memory.get(host)
    if (!current || current.day !== day) return DETAIL_DAILY_CAP
    return Math.max(0, DETAIL_DAILY_CAP - current.count)
  }
}

/** Counts job-detail fetches. Robots and sitemap requests do not use this cap. */
export async function takeDetailSlot(host: string): Promise<boolean> {
  const day = today()
  if (process.env.VITEST) return takeMemory(host)
  try {
    const existing = await db.crawlBudget.findUnique({ where: { host } })
    if (!existing || existing.day !== day) {
      await db.crawlBudget.upsert({
        where: { host },
        update: { day, detailFetches: 1 },
        create: { host, day, detailFetches: 1 },
      })
      return true
    }
    if (existing.detailFetches >= DETAIL_DAILY_CAP) return false
    await db.crawlBudget.update({
      where: { host },
      data: { detailFetches: { increment: 1 } },
    })
    return true
  } catch {
    return takeMemory(host)
  }
}
