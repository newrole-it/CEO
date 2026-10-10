import db from "db"

export const DETAIL_DAILY_CAP = 200

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

/** Counts job-detail fetches. Robots and sitemap requests do not use this cap. */
export async function takeDetailSlot(host: string): Promise<boolean> {
  const day = today()
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
