import db from "../db"
import { areasToMention, pickMixedPreview, techArea, TECH_AREAS, type TechArea } from "./role"

/** Jobs still waiting for a classification stay visible. Classified non-tech roles do not. */
export function techScopeWhere() {
  return {
    OR: [
      { classifiedAt: null },
      { isTechRole: true },
      { AND: [{ isTechRole: null }, { company: { isTech: true } }] },
    ],
  }
}

/** Active in-scope tech offers. Null until at least one active job has been classified. */
export async function activeTechOfferCount(): Promise<number | null> {
  const classified = await db.job.count({
    where: { status: "ACTIVE", classifiedAt: { not: null } },
  })
  if (classified === 0) return null
  return db.job.count({
    where: {
      status: "ACTIVE",
      OR: [{ isTechRole: true }, { AND: [{ isTechRole: null }, { company: { isTech: true } }] }],
    },
  })
}

export async function landingPreview(limit = 3) {
  const rows = await db.job.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ isTechRole: true }, { AND: [{ isTechRole: null }, { company: { isTech: true } }] }],
    },
    orderBy: { firstSeenAt: "desc" },
    take: 80,
    select: {
      id: true,
      title: true,
      locationText: true,
      seniorityLevel: true,
      company: { select: { name: true } },
    },
  })
  const pool =
    rows.length > 0
      ? rows
      : await db.job.findMany({
          where: { status: "ACTIVE" },
          orderBy: { firstSeenAt: "desc" },
          take: 24,
          select: {
            id: true,
            title: true,
            locationText: true,
            seniorityLevel: true,
            company: { select: { name: true } },
          },
        })
  const picked = pickMixedPreview(
    pool.map((job) => ({
      ...job,
      seniority: job.seniorityLevel,
      key: `${job.company.name}\u0000${job.title}`.toLowerCase(),
    })),
    limit
  )
  return picked.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company.name,
    location: job.locationText || "",
  }))
}

const inScope = {
  status: "ACTIVE" as const,
  OR: [{ isTechRole: true }, { AND: [{ isTechRole: null }, { company: { isTech: true } }] }],
}

/** Specialisms with enough active tech offers to name in the subtitle. */
export async function coveredSpecialisms(): Promise<TechArea[]> {
  const classified = await db.job.count({
    where: { status: "ACTIVE", classifiedAt: { not: null } },
  })
  if (classified === 0) return [...TECH_AREAS]
  const jobs = await db.job.findMany({
    where: inScope,
    select: { title: true },
  })
  const counts = Object.fromEntries(TECH_AREAS.map((area) => [area, 0])) as Record<TechArea, number>
  for (const job of jobs) {
    const area = techArea(job.title)
    if (area) counts[area] += 1
  }
  return areasToMention(counts, jobs.length)
}
