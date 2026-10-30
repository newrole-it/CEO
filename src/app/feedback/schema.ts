import { z } from "zod"
import { FEEDBACK_ASPECTS, FEEDBACK_VERDICTS } from "src/shared/feedback-aspects"

export const LocaleInput = z.enum(["pl", "en"]).optional()
export const AspectInput = z.enum(FEEDBACK_ASPECTS)
export const VerdictInput = z.enum(FEEDBACK_VERDICTS)

export const SaveFeedbackInput = z.object({
  jobId: z.string().min(1).max(64),
  verdict: VerdictInput,
  aspects: z.array(AspectInput).max(FEEDBACK_ASPECTS.length).optional(),
  tags: z.array(z.string().max(200)).max(40).optional(),
  note: z.string().max(4000).nullable().optional(),
})

export const BrowseFilterInput = z.object({
  where: z.string().max(20).optional(),
  city: z.string().max(80).optional(),
  mode: z.string().max(20).optional(),
  pay: z.union([z.number(), z.string().max(20)]).optional(),
  phrase: z.string().max(160).optional(),
  q: z.string().max(160).optional(),
  location: z.string().max(120).optional(),
})
