import db, { Prisma, type InterviewStory } from "db"
import type { LlmClient } from "@newrole/llm/common"
import {
  cleanStory,
  cleanThemes,
  parseStoryChecks,
  type StoryFields,
} from "@newrole/cv-core/stories"
import { draftStoryBank } from "@newrole/cv-engine/interview"
import { takeSlot } from "src/server/auth/magic-link"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import {
  INTERVIEW_LIMITS,
  InterviewError,
  STORY_ORIGINS,
  type DraftStoriesResult,
  type InterviewLocale,
  type StoryOrigin,
  type StoryStatus,
  type StoryView,
} from "./types"

/**
 * The story bank: a person's reusable interview stories (InterviewStory). The person writes them
 * by hand, or a model drafts some from their CV and profile; a draft is kept apart (status DRAFT)
 * until the person saves it, and only saved stories are used for interview preparation.
 * Contract for the web app and, later, MCP tools.
 */

/** Stories per person: a bank is a handful of deep stories, not hundreds. */
export const MAX_STORIES = 200
/** How much of the person's data a drafting run reads and checks against. */
const CONTEXT_CHARS = 16_000

const STATUS: Record<StoryStatus, string> = { draft: "DRAFT", saved: "SAVED" }

export function toStoryView(row: InterviewStory): StoryView {
  const status: StoryStatus = row.status === STATUS.draft ? "draft" : "saved"
  return {
    id: row.id,
    title: row.title,
    situation: row.situation,
    task: row.task,
    action: row.action,
    result: row.result,
    reflection: row.reflection,
    themes: cleanThemes(row.themes),
    source: row.source ?? "",
    origin: (STORY_ORIGINS as readonly string[]).includes(row.origin)
      ? (row.origin as StoryOrigin)
      : "manual",
    status,
    checks: status === "draft" ? parseStoryChecks(row.checks) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/** The person's stories, newest first. `status` narrows to drafts or to saved ones. */
export async function listStories(
  userId: number,
  opts: { status?: StoryStatus } = {}
): Promise<StoryView[]> {
  const rows = await db.interviewStory.findMany({
    where: { userId, ...(opts.status ? { status: STATUS[opts.status] } : {}) },
    orderBy: { updatedAt: "desc" },
    take: MAX_STORIES,
  })
  return rows.map(toStoryView)
}

export async function getStory(userId: number, id: string): Promise<StoryView | null> {
  const row = await db.interviewStory.findFirst({ where: { id, userId } })
  return row ? toStoryView(row) : null
}

export type SaveStoryInput = Partial<StoryFields> & {
  /** With an id the story is updated; without one it is added */
  id?: string
  title: string
  /** Where a new story comes from; a story that exists keeps its own */
  origin?: StoryOrigin
}

function storyData(fields: StoryFields) {
  return {
    title: fields.title,
    situation: fields.situation,
    task: fields.task,
    action: fields.action,
    result: fields.result,
    reflection: fields.reflection,
    themes: fields.themes as Prisma.InputJsonValue,
    source: fields.source || null,
  }
}

/**
 * Adds a story or updates one by id. Saving is the person's word: a draft saved this way becomes
 * a saved story and loses the notes of its check. Throws InterviewError: "invalid" without a
 * title, "not-found" for an id that is not the person's, "limit" at MAX_STORIES.
 */
export async function saveStory(userId: number, input: SaveStoryInput): Promise<StoryView> {
  const fields = cleanStory(input)
  if (!fields.title) throw new InterviewError("invalid", "A story needs a title.")
  if (input.id) {
    const existing = await db.interviewStory.findFirst({
      where: { id: input.id, userId },
      select: { id: true },
    })
    if (!existing) throw new InterviewError("not-found", "Story not found.")
    const row = await db.interviewStory.update({
      where: { id: existing.id },
      data: { ...storyData(fields), status: STATUS.saved, checks: Prisma.DbNull },
    })
    return toStoryView(row)
  }
  if ((await db.interviewStory.count({ where: { userId } })) >= MAX_STORIES)
    throw new InterviewError("limit", "The story bank is full.")
  const row = await db.interviewStory.create({
    data: {
      userId,
      ...storyData(fields),
      origin: input.origin ?? "manual",
      status: STATUS.saved,
    },
  })
  return toStoryView(row)
}

/** Deletes one story, saved or draft. Throws InterviewError("not-found"). */
export async function deleteStory(userId: number, id: string): Promise<void> {
  const removed = await db.interviewStory.deleteMany({ where: { id, userId } })
  if (!removed.count) throw new InterviewError("not-found", "Story not found.")
}

/**
 * Drafts stories from the person's CV and profile and keeps them as drafts. Every draft was
 * checked against that data by code (checkStoryDrafts): what it could not find is gone, and what
 * the data does not say is a question for the person. Never throws for a missing or failing
 * model, or for too many runs in an hour: the code says what happened and the bank stays usable
 * by hand.
 * `llm` is injectable for tests; null means no model.
 */
export async function draftStories(
  userId: number,
  opts: { locale: InterviewLocale; count?: number; llm?: LlmClient | null }
): Promise<DraftStoriesResult> {
  const none = (code: DraftStoriesResult["code"], dropped = 0): DraftStoriesResult => ({
    code,
    stories: [],
    dropped,
  })
  const llm = opts.llm === undefined ? createWritingClient() : opts.llm
  if (!llm) return none("no-model")
  const [hasProfile, hasCv, existing] = await Promise.all([
    db.candidateProfile.count({ where: { userId } }),
    db.cvDocument.count({ where: { userId, docType: "CV", content: { not: Prisma.AnyNull } } }),
    db.interviewStory.findMany({ where: { userId }, select: { title: true } }),
  ])
  if (!hasProfile && !hasCv) return none("no-data")
  const room = MAX_STORIES - existing.length
  if (room <= 0) throw new InterviewError("limit", "The story bank is full.")
  const { key, perHour } = INTERVIEW_LIMITS.draft
  if (!(await takeSlot(key(userId), perHour, new Date()))) return none("limited")
  // one text is both what the model reads and what its drafts are checked against
  const context = await candidateContext(userId, CONTEXT_CHARS)
  let found: Awaited<ReturnType<typeof draftStoryBank>>
  try {
    found = await draftStoryBank({
      llm,
      context,
      evidence: context,
      existing: existing.map((row) => row.title),
      locale: opts.locale,
      count: opts.count,
      userId,
    })
  } catch (error) {
    console.error(`[interview] drafting stories failed: ${(error as Error).name}`)
    return none("failed")
  }
  if (!found) return none("failed")
  if (!found.drafts.length) return none("nothing", found.dropped)
  const rows = await db.$transaction(
    found.drafts.slice(0, room).map(({ checks, ...fields }) =>
      db.interviewStory.create({
        data: {
          userId,
          ...storyData(fields),
          origin: "draft",
          status: STATUS.draft,
          checks: checks as Prisma.InputJsonValue,
        },
      })
    )
  )
  return { code: "drafted", stories: rows.map(toStoryView), dropped: found.dropped }
}
