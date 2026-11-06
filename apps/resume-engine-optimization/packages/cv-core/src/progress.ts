import { z } from "zod"

/**
 * The steps of writing for an offer, in the order they run, so the person sees what is being done
 * while they wait. Each is real work: a model call or a check by code. A step reports numbers, not
 * sentences; the interface words them.
 *
 * offer: what the offer asks for (job-description-analyzer). cv: the starting CV checked by code
 * (resume-ats-optimizer, resume-bullet-writer). match: the person's data against each requirement,
 * scored by code (job-description-analyzer). tailor: wording and order aimed at the offer
 * (resume-tailor). bullets: weak bullets rewritten, questions where a number would help
 * (resume-bullet-writer, resume-quantifier). ats: keywords and layout of the result checked by
 * code (resume-ats-optimizer). facts: every number and name of the result checked against the
 * person's data. letter and letterFacts: the cover letter (cover-letter-generator) and its check.
 */
export const TAILOR_STEPS = ["offer", "cv", "match", "tailor", "bullets", "ats", "facts"] as const
export const LETTER_STEPS = ["letter", "letterFacts"] as const

export const TailorStep = z.enum([...TAILOR_STEPS, ...LETTER_STEPS])
export type TailorStep = z.infer<typeof TailorStep>

/** skipped: nothing to do, as an analysis with no offer text; failed: the run went on without it */
export const StepState = z.enum(["running", "done", "skipped", "failed"])
export type StepState = z.infer<typeof StepState>

export const StepUpdate = z.object({
  step: TailorStep,
  state: StepState,
  /** What the step found, as numbers the interface puts into words */
  detail: z.record(z.number()).optional(),
})
export type StepUpdate = z.infer<typeof StepUpdate>

export type StepReporter = (update: StepUpdate) => void

/** What a run has reported so far, one entry per step, in the order of the steps. */
export type TailorProgress = { steps: StepUpdate[] }
