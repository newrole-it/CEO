import { ACTIVE_STATUSES } from "src/shared/applications"
import { COLD_AFTER_DAYS, calendarDays } from "./followups"
import { reachedStage, type InsightApplication } from "./insights"
import { responded } from "./logic"

/**
 * What the outcomes of the person's applications say: which kinds of application got replies and
 * interviews more often than the rest. Pure: rows in, counts out; no model is asked anything.
 *
 * After career-ops' analyze-patterns.mjs and modes/patterns.md (structure only): an outcome per
 * application, segments compared with each other, minimum amounts of data before anything is
 * said. The rule for "a difference worth naming" is ours, and deliberately simple, because a
 * person's own job search is a few dozen applications, too few for a significance test to mean
 * much:
 * - nothing is shown before MIN_DECIDED applications have an outcome;
 * - a segment is compared with the rest only when both sides have MIN_GROUP decided applications;
 * - a comparison is a finding only when the rates differ by at least MIN_DIFFERENCE (in points).
 * Every row shows its counts, so the person can see how little or how much it rests on. This
 * shows what went together, not why: a segment can differ for reasons the data does not hold.
 */

export const PATTERN_RULES = {
  /** Applications with an outcome before any pattern is shown (career-ops: 5 sent) */
  minDecided: 5,
  /** Decided applications on each side of a comparison (career-ops: n ≥ 8 per channel) */
  minGroup: 8,
  /** Difference between the two rates, 0–1, before it is named a finding */
  minDifference: 0.2,
  /** Rejections before the stage they cluster at is named */
  minRejections: 5,
  /** Share of rejections at one stage before it is named */
  rejectionShare: 0.5,
} as const

/** What is known about an application besides its status, read from what it was sent with. */
export type PatternTraits = {
  /** The match score of the CV sent with it, from its newest round */
  matchScore: number | null
  /** tailored: a CV written for this offer; general: another CV; null: none recorded */
  cv: "tailored" | "general" | null
  /** A cover letter written for this offer exists; null when the offer is not known */
  letter: boolean | null
  workplace: "REMOTE" | "HYBRID" | "ONSITE" | null
  /** Published by an agency or another intermediary, not the employer; null when unknown */
  intermediary: boolean | null
  /** Days from the posting's publication (or first sight) to the application */
  postingAgeDays: number | null
  /** The decision of "Is it worth applying", when the offer was evaluated */
  evaluation: "apply" | "consider" | "skip" | "unknown" | null
}

export type PatternApplication = Pick<
  InsightApplication,
  "id" | "status" | "closedAtStage" | "appliedAt" | "statusChangedAt" | "source" | "events"
> &
  PatternTraits

/** What the comparison counts: any reply, or getting as far as an interview. */
export type PatternMetric = "reply" | "interview"

export type SegmentDimension =
  "match" | "cv" | "letter" | "workplace" | "intermediary" | "postingAge" | "evaluation" | "source"

/** A segment's values, each a code the interface words. */
export type SegmentValue = string

export type Comparison = {
  dimension: SegmentDimension
  value: SegmentValue
  metric: PatternMetric
  /** Decided applications in the segment, and how many of them had the outcome */
  n: number
  hits: number
  rate: number
  /** The same for every other decided application that has this dimension known */
  restN: number
  restHits: number
  restRate: number
  /** rate − restRate */
  difference: number
  /** The difference is at least PATTERN_RULES.minDifference */
  finding: boolean
}

export type RejectionStage = {
  /** The stage most rejections came at: APPLIED means before any reply */
  stage: string
  n: number
  rejections: number
}

export type Patterns = {
  /** Applications sent (all but deleted) */
  sent: number
  /** Of those, with an outcome: a reply, a close, or silence past COLD_AFTER_DAYS */
  decided: number
  /** How many more decided applications are needed before patterns show; 0 when enough */
  needed: number
  /** Rates over all decided applications; null with none */
  baseline: { reply: number | null; interview: number | null }
  /** Comparisons with enough data on both sides; findings first, larger differences first */
  comparisons: Comparison[]
  /** Dimensions that had a known value on too few applications to compare anything */
  thin: SegmentDimension[]
  rejections: RejectionStage | null
}

const INTERVIEW_RANK = ACTIVE_STATUSES.indexOf("INTERVIEW")

/** Match score bands, as the match page reads them (packages/cv-core/src/match.ts bandOf). */
export function matchBand(score: number | null): "75+" | "60-74" | "under-60" | null {
  if (score == null) return null
  if (score >= 75) return "75+"
  if (score >= 60) return "60-74"
  return "under-60"
}

export function postingAgeBand(days: number | null): "0-7" | "8-30" | "31+" | null {
  if (days == null || days < 0) return null
  if (days <= 7) return "0-7"
  if (days <= 30) return "8-30"
  return "31+"
}

/**
 * Whether an application has an outcome to learn from. A reply or a close counts; so does an
 * application still APPLIED after COLD_AFTER_DAYS of silence (it is as good as unanswered).
 * Withdrawing before anyone answered says nothing about the company and does not count.
 */
export function isDecided(app: PatternApplication, now: Date): boolean {
  if (responded(app)) return true
  if (app.status === "GHOSTED" || app.status === "REJECTED") return true
  if (app.status === "WITHDRAWN") return false
  return app.status === "APPLIED" && calendarDays(app.appliedAt, now) >= COLD_AFTER_DAYS
}

function segmentOf(app: PatternApplication, dimension: SegmentDimension): SegmentValue | null {
  switch (dimension) {
    case "match":
      return matchBand(app.matchScore)
    case "cv":
      return app.cv
    case "letter":
      return app.letter == null ? null : app.letter ? "with" : "without"
    case "workplace":
      return app.workplace
    case "intermediary":
      return app.intermediary == null ? null : app.intermediary ? "agency" : "employer"
    case "postingAge":
      return postingAgeBand(app.postingAgeDays)
    case "evaluation":
      return app.evaluation === "unknown" ? null : app.evaluation
    case "source":
      return app.source
  }
}

export const DIMENSIONS: SegmentDimension[] = [
  "match",
  "evaluation",
  "cv",
  "letter",
  "workplace",
  "intermediary",
  "postingAge",
  "source",
]

const METRICS: PatternMetric[] = ["reply", "interview"]

function hit(app: PatternApplication, metric: PatternMetric): boolean {
  return metric === "reply" ? responded(app) : reachedStage(app) >= INTERVIEW_RANK
}

/** The stage a rejected application had reached when it was rejected. */
function rejectedAtStage(app: PatternApplication): string {
  if (app.closedAtStage) return app.closedAtStage
  const stage = reachedStage(app)
  return ACTIVE_STATUSES[Math.max(0, stage)]
}

export function computePatterns(applications: PatternApplication[], opts: { now: Date }): Patterns {
  const sent = applications.length
  const decided = applications.filter((app) => isDecided(app, opts.now))
  const needed = Math.max(0, PATTERN_RULES.minDecided - decided.length)
  const rate = (rows: PatternApplication[], metric: PatternMetric) =>
    rows.length ? rows.filter((app) => hit(app, metric)).length / rows.length : null
  const baseline = { reply: rate(decided, "reply"), interview: rate(decided, "interview") }

  const comparisons: Comparison[] = []
  const thin: SegmentDimension[] = []
  if (!needed) {
    for (const dimension of DIMENSIONS) {
      const known = decided.flatMap((app) => {
        const value = segmentOf(app, dimension)
        return value == null ? [] : [{ app, value }]
      })
      const values = [...new Set(known.map((item) => item.value))].sort()
      let compared = false
      for (const value of values) {
        const inside = known.filter((item) => item.value === value).map((item) => item.app)
        const rest = known.filter((item) => item.value !== value).map((item) => item.app)
        if (inside.length < PATTERN_RULES.minGroup || rest.length < PATTERN_RULES.minGroup) continue
        compared = true
        for (const metric of METRICS) {
          const hits = inside.filter((app) => hit(app, metric)).length
          const restHits = rest.filter((app) => hit(app, metric)).length
          const segmentRate = hits / inside.length
          const restRate = restHits / rest.length
          const difference = segmentRate - restRate
          comparisons.push({
            dimension,
            value,
            metric,
            n: inside.length,
            hits,
            rate: segmentRate,
            restN: rest.length,
            restHits,
            restRate,
            difference,
            // rounded first, so 0.2 computed as 0.19999… still counts
            finding: Math.round(Math.abs(difference) * 1000) / 1000 >= PATTERN_RULES.minDifference,
          })
        }
        // with two values the second comparison only mirrors the first
        if (values.length === 2) break
      }
      if (!compared) thin.push(dimension)
    }
  }
  comparisons.sort(
    (a, b) =>
      Number(b.finding) - Number(a.finding) ||
      Math.abs(b.difference) - Math.abs(a.difference) ||
      DIMENSIONS.indexOf(a.dimension) - DIMENSIONS.indexOf(b.dimension)
  )

  const rejected = applications.filter((app) => app.status === "REJECTED")
  let rejections: RejectionStage | null = null
  if (rejected.length >= PATTERN_RULES.minRejections) {
    const byStage = new Map<string, number>()
    for (const app of rejected) {
      const stage = rejectedAtStage(app)
      byStage.set(stage, (byStage.get(stage) ?? 0) + 1)
    }
    const [stage, n] = [...byStage.entries()].sort((a, b) => b[1] - a[1])[0]
    if (n / rejected.length >= PATTERN_RULES.rejectionShare)
      rejections = { stage, n, rejections: rejected.length }
  }

  return { sent, decided: decided.length, needed, baseline, comparisons, thin, rejections }
}
