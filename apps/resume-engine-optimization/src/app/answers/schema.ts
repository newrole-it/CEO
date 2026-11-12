import { NotFoundError } from "src/shared/errors"
import { z } from "zod"
import {
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  MAX_TAGS,
  MAX_TAG_LENGTH,
} from "src/server/answers/filter"
import { AnswerError } from "src/server/answers/service"

export const IdInput = z.object({ id: z.string().min(1).max(64) })

export const SearchAnswersInput = z.object({
  q: z.string().max(200).optional(),
  tag: z.string().max(MAX_TAG_LENGTH).optional(),
  limit: z.number().int().min(1).max(500).optional(),
})

export const SimilarAnswersInput = z.object({
  question: z.string().max(MAX_QUESTION_LENGTH),
  limit: z.number().int().min(1).max(20).optional(),
})

const optionalText = (max: number) => z.string().max(max).nullable().optional()

export const SaveAnswerInput = z.object({
  id: z.string().min(1).max(64).optional(),
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  answer: z.string().min(1).max(MAX_ANSWER_LENGTH),
  tags: z
    .array(z.string().max(200))
    .max(MAX_TAGS * 4)
    .optional(),
  language: z.enum(["pl", "en"]).nullable().optional(),
  company: optionalText(200),
  jobTitle: optionalText(200),
  sourceUrl: optionalText(1000),
  origin: z.enum(["manual", "draft"]).optional(),
})

export const DraftAnswerInput = z.object({
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  company: optionalText(200),
  jobTitle: optionalText(200),
  url: optionalText(2000),
  maxChars: z.number().int().min(1).max(MAX_ANSWER_LENGTH).optional(),
  language: z.enum(["pl", "en"]).optional(),
})

/** Maps a missing answer to the error the client understands. */
export function rethrowAnswer(error: unknown): never {
  if (error instanceof AnswerError && error.code === "not-found")
    throw new NotFoundError(error.message)
  throw error
}
