import db from "db"
import { getPreferenceSummary } from "src/server/preferences/model"
import { similarCompanyContext } from "./similar-companies"

/** What a hunt for offers outside the aggregators starts from, for one person. */
export async function discoveryInputs(userId: number) {
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
    getPreferenceSummary(userId, "pl"),
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
