/** What a person can say they liked (or disliked) about an offer. Stored in OfferFeedback.aspects. */
export const FEEDBACK_ASPECTS = [
  "role",
  "stack",
  "seniority",
  "salary",
  "remote",
  "location",
  "company",
  "industry",
  "scope",
  "contract",
] as const

export type FeedbackAspect = (typeof FEEDBACK_ASPECTS)[number]

export const FEEDBACK_VERDICTS = ["LIKE", "DISLIKE", "APPLIED"] as const

export type FeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number]

export function isFeedbackAspect(value: unknown): value is FeedbackAspect {
  return typeof value === "string" && (FEEDBACK_ASPECTS as readonly string[]).includes(value)
}

export function parseAspects(value: unknown): FeedbackAspect[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isFeedbackAspect))]
}
