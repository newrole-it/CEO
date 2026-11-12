/**
 * Hiring confidence: how much speaks for a company really hiring for an offer, 0–100. It answers
 * "is this a ghost offer?": a posting by a real company for an opening nobody is filling now.
 *
 * It is a score from rules, not a measured probability. No source gives weights for the signs, and
 * nobody publishes which postings ended in a hire ("There are no official statistics on the
 * magnitude of ghost jobs", CRS). The signs come from the sources below, read on 2026-11-12; the
 * points, the thresholds and the starting score are ours.
 *
 * - Rutgers University–Newark, "The Truth About Ghost Jobs" (2025-03-28): "The position was posted
 *   several weeks or months ago", "The posting is active on the recruiter's page but not on the
 *   company's", "There's no recruiter engagement on the posting".
 *   https://careers.newark.rutgers.edu/blog/2025/03/28/the-truth-about-ghost-jobs-what-they-are-and-how-to-spot-them/
 * - Congressional Research Service, IF12977 "“Ghost” Job Postings" (2025-04-25): employers "collect
 *   resumes for hiring at a later time"; staffing agencies may invent openings.
 *   https://www.everycrsreport.com/reports/IF12977.html
 * - Ashby, "How common are ghost jobs?" (22,000 jobs, 2021–2024): at companies of 50 or more people
 *   "97.5% of jobs move at least some candidates to an active interview stage", so talks with the
 *   company are what a real opening looks like.
 *   https://www.ashbyhq.com/talent-trends-report/reports/ghost-jobs
 *
 * The same title open several times at one company (`evergreen`) is our reading of CRS's résumé
 * collecting; a company hiring in several cities looks the same, so it weighs little.
 * Not read yet: reposts (an ATS can move the publication date, and the history of sightings is too
 * short), layoffs and hiring freezes, a recruiter's word.
 */

export type HiringSignalCode =
  /** Days since the posting's publication date (`n`) */
  | "age"
  /** No publication date; first seen `n` days ago, so it is at least that old */
  | "seen"
  | "age-unknown"
  | "own-site"
  | "intermediary"
  /** `n` other open postings of the company carry the same title */
  | "evergreen"
  | "maybe-closed"
  | "in-talks"
  | "no-reply"

export type HiringSignal = { code: HiringSignalCode; points: number; n?: number }

export type HiringLevel = "high" | "medium" | "low"

export type HiringConfidence = { score: number; level: HiringLevel; signals: HiringSignal[] }

export type HiringFacts = {
  publishedAt: Date | null
  firstSeenAt: Date
  /** Read from the company's own ATS or career page, not through a recruiter or a job board */
  ownSite: boolean
  viaIntermediary: boolean
  /** The posting was not found at the last reading, but is not known to be closed */
  possiblyClosed: boolean
  /** Other open postings of the same company with the same title */
  sameTitleOpen: number
  /** The person's application for the offer, when they track one */
  applicationStatus: string | null
}

const DAY_MS = 86_400_000

/** Where a posting starts before any sign is read. */
const START = 60

/** A posting first seen this long ago without a date is old enough to say so. */
const SEEN_DAYS = 30

/** The company answered: the application moved past "applied". */
const TALKS = new Set(["SCREENING", "INTERVIEW", "TASK", "FINAL", "OFFER", "ACCEPTED"])

function agePoints(days: number): number {
  if (days <= 30) return 15
  if (days <= 60) return 0
  if (days <= 90) return -10
  if (days <= 180) return -20
  return -30
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

export function hiringLevel(score: number): HiringLevel {
  if (score >= 70) return "high"
  if (score >= 40) return "medium"
  return "low"
}

export function hiringConfidence(facts: HiringFacts, now: Date): HiringConfidence {
  const signals: HiringSignal[] = []
  const published = facts.publishedAt ? daysBetween(facts.publishedAt, now) : null
  const seen = daysBetween(facts.firstSeenAt, now)
  if (published != null && published >= 0) {
    signals.push({ code: "age", points: agePoints(published), n: published })
  } else if (seen > SEEN_DAYS) {
    signals.push({ code: "seen", points: agePoints(seen), n: seen })
  } else {
    signals.push({ code: "age-unknown", points: 0 })
  }
  if (facts.viaIntermediary) signals.push({ code: "intermediary", points: -10 })
  else if (facts.ownSite) signals.push({ code: "own-site", points: 10 })
  if (facts.sameTitleOpen >= 2) {
    signals.push({
      code: "evergreen",
      points: facts.sameTitleOpen >= 5 ? -15 : -5,
      n: facts.sameTitleOpen,
    })
  }
  if (facts.possiblyClosed) signals.push({ code: "maybe-closed", points: -15 })
  if (facts.applicationStatus && TALKS.has(facts.applicationStatus)) {
    signals.push({ code: "in-talks", points: 40 })
  } else if (facts.applicationStatus === "GHOSTED") {
    signals.push({ code: "no-reply", points: -15 })
  }
  const sum = signals.reduce((total, signal) => total + signal.points, START)
  const score = Math.max(0, Math.min(100, sum))
  return { score, level: hiringLevel(score), signals }
}
