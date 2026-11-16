import type { CvLocale } from "@newrole/cv-core/blank"
import type { InterviewPrepContent } from "@newrole/cv-core/stories-prep"
import type { StoryChecks, StoryFields } from "@newrole/cv-core/stories"

/** Types of the story bank and interview preparation, shared by the service, the RPC and MCP. */

export const STORY_ORIGINS = ["manual", "draft", "mcp"] as const
export type StoryOrigin = (typeof STORY_ORIGINS)[number]

/** draft: a model wrote it and the person has not saved it yet; saved: the person's own. */
export type StoryStatus = "draft" | "saved"

export type StoryView = StoryFields & {
  id: string
  origin: StoryOrigin
  status: StoryStatus
  /** For a draft: what code found when it checked it against the person's data */
  checks: StoryChecks | null
  createdAt: Date
  updatedAt: Date
}

/** The language a text for the person is written in: their interface language. */
export type InterviewLocale = CvLocale

/** limit: the bank is full; limited: too many model runs of one kind in the last hour */
export type InterviewErrorCode = "not-found" | "invalid" | "limit" | "limited" | "job-not-found"

export class InterviewError extends Error {
  code: InterviewErrorCode
  constructor(code: InterviewErrorCode, message: string) {
    super(message)
    this.name = "InterviewError"
    this.code = code
  }
}

/**
 * How a drafting run ended. drafted: at least one draft was kept. nothing: the model answered but
 * no draft stood up to the person's data. no-data: there is no CV or profile to draft from.
 * no-model: no model is configured, the bank is filled by hand. failed: the model did not answer.
 * limited: too many drafting runs in the last hour.
 */
export type DraftStoriesCode = "drafted" | "nothing" | "no-data" | "no-model" | "failed" | "limited"

export type DraftStoriesResult = {
  code: DraftStoriesCode
  /** The drafts kept, stored as drafts */
  stories: StoryView[]
  /** Drafts thrown away because the person's data did not back them */
  dropped: number
}

export type InterviewPrepView = {
  jobId: string
  company: string
  title: string
  content: InterviewPrepContent
  locale: InterviewLocale
  generatedAt: Date
}

/**
 * The application statuses in which the link to interview preparation is shown: from the first
 * screen to the final round (src/shared/applications.ts).
 */
export const INTERVIEW_STATUSES = ["SCREENING", "INTERVIEW", "TASK", "FINAL"] as const

export function inInterviewStage(status: string | null | undefined): boolean {
  return (INTERVIEW_STATUSES as readonly string[]).includes(status ?? "")
}

/** The hourly caps on the two model runs, by the key each is counted under (takeSlot). */
export const INTERVIEW_LIMITS = {
  draft: { key: (userId: number) => `interview-stories:${userId}`, perHour: 10 },
  prep: { key: (userId: number) => `interview-prep:${userId}`, perHour: 20 },
}
