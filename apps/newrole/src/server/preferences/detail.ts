/** Everything the offer drawer shows: the card, the score breakdown, reasons, tags and saved feedback. */
import db from "db"
import { scoreOfferForUser, type FeedOffer } from "src/server/jobs/browse"
import type { FeedReason } from "./feed"
import type { ScorePart } from "./breakdown"
import { getFeedback } from "./feedback"
import { profileOffer } from "./facts"
import { feedbackJobSelect, jobToOffer } from "./model"
import type { FeedbackAspect, Locale, OfferFeedbackView, PreferenceAdjustment } from "./types"

export type SearchComponent = { id: string; max: number; points: number; reason: string }

export type OfferDetail = {
  offer: FeedOffer
  /** Same number as the For-you card. */
  score: number
  /** Sum of parts, before the adjustments below. */
  base: number
  parts: ScorePart[]
  industryDelta: number
  skillDelta: number
  industry: string | null
  preference: PreferenceAdjustment
  reasons: FeedReason[]
  tags: { aspect: FeedbackAspect; key: string; label: string }[]
  feedback: OfferFeedbackView | null
  /** The saved-search score for this offer, when one of your searches matched it. */
  searchMatch: {
    savedSearchId: string
    score: number
    components: SearchComponent[]
    penalties: { id: string; points: number; reason: string }[]
  } | null
  hasProfile: boolean
  hasFeedback: boolean
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

/** The stored packages/matching/scoring.ts breakdown, read defensively (older rows have other shapes). */
export function searchComponents(breakdown: unknown): {
  components: SearchComponent[]
  penalties: { id: string; points: number; reason: string }[]
} {
  const record = asRecord(breakdown)
  const components = Array.isArray(record?.components) ? record!.components : []
  const penalties = Array.isArray(record?.penalties) ? record!.penalties : []
  return {
    components: components.flatMap((item) => {
      const part = asRecord(item)
      if (!part || typeof part.id !== "string") return []
      return [
        {
          id: part.id,
          max: typeof part.weight === "number" ? part.weight : 0,
          points: typeof part.points === "number" ? part.points : 0,
          reason: typeof part.reason === "string" ? part.reason : "",
        },
      ]
    }),
    penalties: penalties.flatMap((item) => {
      const penalty = asRecord(item)
      if (!penalty || typeof penalty.id !== "string") return []
      return [
        {
          id: penalty.id,
          points: typeof penalty.points === "number" ? penalty.points : 0,
          reason: typeof penalty.reason === "string" ? penalty.reason : "",
        },
      ]
    }),
  }
}

export async function getOfferDetail(
  jobId: string,
  userId: number | null,
  locale: Locale
): Promise<OfferDetail | null> {
  const [scored, job, feedback, match] = await Promise.all([
    scoreOfferForUser(jobId, userId, locale),
    db.job.findUnique({ where: { id: jobId }, select: feedbackJobSelect }),
    userId ? getFeedback(userId, jobId) : null,
    userId
      ? db.jobMatch.findFirst({
          where: { jobId, savedSearch: { userId } },
          orderBy: { matchedAt: "desc" },
          select: { savedSearchId: true, score: true, scoreBreakdown: true },
        })
      : null,
  ])
  if (!scored || !job) return null
  const facts = profileOffer(jobToOffer(job)).facts
  return {
    offer: scored.view,
    score: scored.score.score,
    base: scored.score.base,
    parts: scored.score.parts,
    industryDelta: scored.score.industryDelta,
    skillDelta: scored.score.skillDelta,
    industry: scored.score.industry,
    preference: scored.score.preference,
    reasons: scored.score.reasons,
    tags: facts.map((fact) => ({
      aspect: fact.aspect,
      key: fact.key,
      label: locale === "en" ? fact.label.en : fact.label.pl,
    })),
    feedback,
    searchMatch: match
      ? {
          savedSearchId: match.savedSearchId,
          score: match.score,
          ...searchComponents(match.scoreBreakdown),
        }
      : null,
    hasProfile: scored.hasProfile,
    hasFeedback: scored.hasFeedback,
  }
}
