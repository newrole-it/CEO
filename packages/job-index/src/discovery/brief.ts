import db from "../db"
import { similarCompanyContext } from "./similar-companies"

/**
 * What a hunt for offers outside the aggregators starts from, for one person. `taste` is the app's
 * summary of what the person liked in offers, when it keeps one.
 */
export async function discoveryInputs(
  userId: number,
  opts: { taste?: (userId: number) => Promise<unknown> } = {}
) {
  const [profile, liked, taste, watched, companies, { known }] = await Promise.all([
    db.candidateProfile.findUnique({ where: { userId } }),
    db.offerFeedback.findMany({
      where: { userId, verdict: { in: ["LIKE", "APPLIED"] } },
      select: {
        aspects: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
      orderBy: { updatedAt: "desc" },
      take: 40,
    }),
    opts.taste ? opts.taste(userId) : Promise.resolve(null),
    db.watchedCompany.findMany({
      where: { userId },
      select: { reason: true, company: { select: { name: true, canonicalDomain: true } } },
      take: 100,
    }),
    db.company.findMany({
      where: { careerPages: { some: { enabled: true } } },
      select: { name: true },
      orderBy: { name: "asc" },
    }),
    similarCompanyContext(userId),
  ])
  return { profile, liked, taste, watched, companies, known }
}
