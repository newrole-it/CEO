import db from "../db"

/** No page read for this long means the worker is probably not running. */
const WORKER_IDLE_MS = 15 * 60 * 1000

export async function indexStatus(now = new Date()) {
  const [openOffers, companies, careerPages, dueNow, last] = await Promise.all([
    db.job.count({ where: { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } } }),
    db.company.count(),
    db.careerPage.count({ where: { enabled: true } }),
    db.careerPage.count({ where: { enabled: true, nextCheckAt: { lte: now } } }),
    db.careerPage.findFirst({
      where: { lastCheckedAt: { not: null } },
      orderBy: { lastCheckedAt: "desc" },
      select: { lastCheckedAt: true },
    }),
  ])
  const lastRead = last?.lastCheckedAt ?? null
  const workerIdle = !lastRead || now.getTime() - lastRead.getTime() > WORKER_IDLE_MS
  return { openOffers, companies, careerPages, dueNow, lastRead, workerIdle }
}

/** Puts a company's career pages at the front of the worker's queue. Null: no such company. */
export async function queueCompanyRefresh(companyId: string, now = new Date()) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { name: true },
  })
  if (!company) return null
  const updated = await db.careerPage.updateMany({
    where: { companyId, enabled: true },
    data: { nextCheckAt: now },
  })
  return { name: company.name, queuedPages: updated.count }
}
