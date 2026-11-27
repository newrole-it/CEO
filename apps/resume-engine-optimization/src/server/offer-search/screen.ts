import { buildEvaluation, type Decision, type EvaluationFacts } from "@newrole/cv-core/evaluation"
import { fold } from "@newrole/matching/text"
import type { SearchFilters } from "src/shared/offer-search"

export type ScreenReason =
  "pay-below" | "work-mode" | "place" | "level" | "excluded-word" | "too-old"

/** True when the folded phrase stands in the folded text as whole words, not inside a longer word. */
function hasWord(text: string, phrase: string): boolean {
  const trimmed = phrase.trim()
  if (!trimmed) return false
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "u").test(text)
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The first rule an offer clearly breaks, or null. Runs before any model: it reads the same
 * dimensions the evaluation does, with no analysis. A missing value never drops an offer.
 */
export function screenOffer(
  offer: EvaluationFacts["offer"] & { publishedAt: Date | null },
  filters: SearchFilters,
  person: EvaluationFacts["person"],
  now: Date
): ScreenReason | null {
  const { dimensions } = buildEvaluation({
    offer,
    person,
    analysis: null,
    report: null,
    missing: "no-model",
  })
  const { pay, workMode, level } = dimensions
  if ((pay.reason === "below" || pay.reason === "far-below") && pay.expected?.floor != null) {
    return "pay-below"
  }
  if (workMode.score === 0) {
    if (workMode.reason === "opposite") return "work-mode"
    if (workMode.reason === "place") return "place"
  }
  if (level.distance != null && Math.abs(level.distance) >= 2) return "level"
  const title = fold(offer.title)
  if (filters.excluded.some((word) => hasWord(title, fold(word)))) {
    return "excluded-word"
  }
  if (
    offer.publishedAt &&
    now.getTime() - offer.publishedAt.getTime() > filters.freshnessDays * DAY_MS
  ) {
    return "too-old"
  }
  return null
}

const ORDER: Array<Decision | null> = ["apply", "consider", "skip", "unknown", null]

/** apply, consider, skip, unknown, then the rest; within one decision by score, highest first, none last. */
export function rankResults<T extends { decision: Decision | null; score: number | null }>(
  rows: T[]
): T[] {
  return [...rows].sort((a, b) => {
    const byDecision = ORDER.indexOf(a.decision) - ORDER.indexOf(b.decision)
    if (byDecision) return byDecision
    if (a.score == null || b.score == null)
      return (a.score == null ? 1 : 0) - (b.score == null ? 1 : 0)
    return b.score - a.score
  })
}
