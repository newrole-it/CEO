import db from "db"
import { diceTokens, fold, tokens } from "../../../matching/text"
import { DELTA_CAP, preferenceAdjustment } from "src/server/preferences/model"
import type { OfferForScoring, PreferenceModel } from "src/server/preferences/types"

const MAX_PENALTY = 8

export type FeedbackOffer = {
  title: string
  company: string
}

/** A small negative adjustment. Similar rejected offers sink a little. The floor is -8. */
export function rejectionPenalty(offer: FeedbackOffer, rejected: FeedbackOffer[]): number {
  if (!rejected.length) return 0
  const offerTokens = tokens(offer.title)
  const company = fold(offer.company)
  let penalty = 0
  for (const item of rejected) {
    const overlap = diceTokens(offerTokens, tokens(item.title))
    let next = 0
    if (overlap >= 0.75) next = 7
    else if (overlap >= 0.5) next = 5
    if (company && company === fold(item.company) && overlap >= 0.25) next += 2
    if (next > penalty) penalty = next
  }
  if (!penalty) return 0
  return -Math.min(MAX_PENALTY, penalty)
}

/**
 * Offers this person passed on: OfferFeedback DISLIKE rows (any screen, any channel) plus
 * older per-search dismissals that predate OfferFeedback. Newest first, one per job.
 */
export async function loadRejectedOffers(
  userId: number,
  take = 40
): Promise<(FeedbackOffer & { jobId: string })[]> {
  const [feedback, legacy] = await Promise.all([
    db.offerFeedback.findMany({
      where: { userId, verdict: "DISLIKE" },
      orderBy: { updatedAt: "desc" },
      take,
      select: {
        jobId: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    }),
    db.jobMatch.findMany({
      where: { dismissedAt: { not: null }, savedSearch: { userId } },
      orderBy: { dismissedAt: "desc" },
      take,
      select: {
        jobId: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    }),
  ])
  const seen = new Set<string>()
  const out: (FeedbackOffer & { jobId: string })[] = []
  for (const row of [...feedback, ...legacy]) {
    if (seen.has(row.jobId)) continue
    seen.add(row.jobId)
    out.push({ jobId: row.jobId, title: row.job.title, company: row.job.company.name })
    if (out.length >= take) break
  }
  return out
}

/**
 * The feedback correction for a ranked list: the preference model (likes up, passes down,
 * explained) combined with the title/company rejection penalty. Bounded to [-12, +12].
 * When both push down, the stronger one wins instead of adding up.
 */
export function feedbackAdjustment(args: {
  offer: OfferForScoring & { id?: string }
  rejected: (FeedbackOffer & { jobId?: string })[]
  model: PreferenceModel | null
}): { delta: number; reasons: string[] } {
  const penalty = rejectionPenalty(
    { title: args.offer.title, company: args.offer.company },
    args.rejected.filter((item) => !args.offer.id || item.jobId !== args.offer.id)
  )
  const preference = args.model
    ? preferenceAdjustment(args.model, args.offer)
    : { delta: 0, reasons: [] as string[] }
  const delta =
    preference.delta < 0 ? Math.min(preference.delta, penalty) : preference.delta + penalty
  return {
    delta: Math.max(-DELTA_CAP, Math.min(DELTA_CAP, delta)),
    reasons: preference.reasons,
  }
}
