import type { CvLocale } from "@newrole/cv-core/blank"
import type { MatchReport, OfferAnalysis } from "@newrole/cv-core/match"
import type { StepReporter } from "@newrole/cv-core/progress"
import type { CvContent } from "@newrole/cv-core/schema"
import type { LlmClient } from "@newrole/llm/common"
import { analyzeOffer, matchCv, type MatchOffer } from "./match"

/**
 * The model's part of "Is it worth applying" (@newrole/cv-core/evaluation): the same two steps
 * that open the tailoring of a CV (./match), run on the person's general CV before any CV is
 * written. The offer is read first, from its text alone, and only then is the person's data
 * checked against what it asks for, so the weight of a requirement never depends on whether the
 * person meets it (career-ops, modes/oferta.md, "Two-pass rule"). Nothing here scores: code does
 * that from the report.
 */

export type OfferFit = {
  /** Null when the offer has no text or the model gave nothing its text backs */
  analysis: OfferAnalysis | null
  /** Null without an analysis, or when the check of the person's data failed */
  report: MatchReport | null
  /** The step that gave nothing, when one did */
  failed: "offer" | "match" | null
}

/**
 * Steps "offer" and "match" of @newrole/cv-core/progress, reported as they run. A step that
 * throws or returns nothing is reported failed and ends the run; the caller still has the rest of
 * the evaluation, which needs no model.
 */
export async function readOfferFit(input: {
  llm: LlmClient
  offer: MatchOffer
  /** The person's general CV */
  cv: CvContent
  /** What a model may know about the person (the profile, their facts, the CV) */
  context: string
  /** Everything the person has said about themselves: evidence must be found in it */
  evidence: string
  /** The language of the notes for the person */
  locale: CvLocale
  userId?: number
  onStep?: StepReporter
}): Promise<OfferFit> {
  const { llm, offer, locale, userId, onStep } = input

  onStep?.({ step: "offer", state: "running" })
  let analysis: OfferAnalysis | null = null
  try {
    analysis = await analyzeOffer({ llm, offer, locale, userId })
  } catch (error) {
    console.error("evaluation step offer failed", error instanceof Error ? error.message : error)
  }
  if (!analysis) {
    onStep?.({ step: "offer", state: "failed" })
    onStep?.({ step: "match", state: "skipped" })
    return { analysis: null, report: null, failed: "offer" }
  }
  const count = (importance: string) =>
    analysis.requirements.filter((item) => item.importance === importance).length
  onStep?.({
    step: "offer",
    state: "done",
    detail: {
      required: count("required"),
      preferred: count("preferred"),
      soft: count("soft"),
      keywords: analysis.keywords.length,
      redFlags: analysis.redFlags.length,
    },
  })

  onStep?.({ step: "match", state: "running" })
  let report: MatchReport | null = null
  try {
    report = await matchCv({
      llm,
      analysis,
      offer,
      cv: input.cv,
      context: input.context,
      evidence: input.evidence,
      locale,
      userId,
    })
  } catch (error) {
    console.error("evaluation step match failed", error instanceof Error ? error.message : error)
  }
  if (!report) {
    onStep?.({ step: "match", state: "failed" })
    return { analysis, report: null, failed: "match" }
  }
  onStep?.({
    step: "match",
    state: "done",
    detail: {
      ...(report.score == null ? {} : { score: report.score }),
      met: report.groups.required.met,
      partial: report.groups.required.partial,
      total: report.groups.required.total,
      critical: report.critical,
    },
  })
  return { analysis, report, failed: null }
}
