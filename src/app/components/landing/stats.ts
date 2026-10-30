import db from "db"

export type IndexStats = { offers: number; companies: number | null; careerPages: number | null }

/** Rounded-down index numbers for the hero and the onboarding "while you wait" card. */
export async function indexStats(): Promise<IndexStats> {
  const open = { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] as ("ACTIVE" | "POSSIBLY_CLOSED")[] } }
  const [offers, companies, careerPages] = await Promise.all([
    db.job.count({ where: open }),
    db.company.count({ where: { jobs: { some: open } } }).catch(() => null),
    db.careerPage.count({ where: { enabled: true, jobs: { some: open } } }).catch(() => null),
  ])
  return { offers, companies, careerPages }
}

/** 16 210 → 16 200; 258 → 250 for "250+". Small numbers stay as they are. */
export function roundDown(n: number): number {
  if (n >= 1000) return Math.floor(n / 100) * 100
  if (n >= 100) return Math.floor(n / 10) * 10
  return n
}
