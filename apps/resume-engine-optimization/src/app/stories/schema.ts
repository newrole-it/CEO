import { z } from "zod"
import { STORY_MAX } from "@newrole/cv-core/stories"
import { NotFoundError } from "src/shared/errors"
import { InterviewError } from "src/server/interview/types"

export const IdInput = z.object({ id: z.string().min(1).max(64) })

const part = z.string().max(STORY_MAX.part).optional()

export const SaveStoryInput = z.object({
  id: z.string().min(1).max(64).optional(),
  title: z.string().min(1).max(STORY_MAX.title),
  situation: part,
  task: part,
  action: part,
  result: part,
  reflection: part,
  themes: z
    .array(z.string().max(200))
    .max(STORY_MAX.themes * 4)
    .optional(),
  source: z.string().max(STORY_MAX.source).optional(),
})

export const DraftStoriesInput = z.object({ count: z.number().int().min(1).max(8).optional() })

/**
 * A missing story becomes the error the client knows; any other InterviewError crosses with its
 * name and code, which the interface translates.
 */
export function rethrowStory(error: unknown): never {
  if (error instanceof InterviewError && error.code === "not-found")
    throw new NotFoundError(error.message)
  throw error
}
