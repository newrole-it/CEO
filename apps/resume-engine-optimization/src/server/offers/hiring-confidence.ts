import db from "db"
import { hiringConfidence, type HiringConfidence } from "src/shared/hiring-confidence"

/**
 * The facts behind an offer's hiring confidence (src/shared/hiring-confidence.ts), read from its
 * Job row, the company's other open postings and the person's application. Nothing is stored: the
 * score is counted when the offer is shown, so it ages with the posting.
 */

export const hiringSelect = {
  id: true,
  companyId: true,
  normalizedTitle: true,
  publishedAt: true,
  firstSeenAt: true,
  status: true,
  sourceType: true,
  viaIntermediary: true,
} as const

export type HiringJob = {
  id: string
  companyId: string
  normalizedTitle: string
  publishedAt: Date | null
  firstSeenAt: Date
  status: string
  sourceType: string
  viaIntermediary: boolean
}

/** A closed posting gets no score: there is nothing left to apply to. */
export async function hiringConfidenceOf(
  job: HiringJob,
  applicationStatus: string | null,
  now: Date = new Date()
): Promise<HiringConfidence | null> {
  if (job.status === "CLOSED") return null
  const sameTitleOpen = await db.job.count({
    where: {
      companyId: job.companyId,
      normalizedTitle: job.normalizedTitle,
      status: "ACTIVE",
      id: { not: job.id },
    },
  })
  return hiringConfidence(
    {
      publishedAt: job.publishedAt,
      firstSeenAt: job.firstSeenAt,
      // WEB_SEARCH is an offer a person added from a page we could not tell the owner of
      ownSite: job.sourceType !== "WEB_SEARCH",
      viaIntermediary: job.viaIntermediary,
      possiblyClosed: job.status === "POSSIBLY_CLOSED",
      sameTitleOpen,
      applicationStatus,
    },
    now
  )
}
