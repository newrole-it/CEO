import db from "db"
import { findJobByUrl } from "src/server/applications/service"
import { draftAnswers, toAnswerView } from "./service"
import type { AnswerView, DraftContext, DraftQuestion, DraftResult } from "./types"

/**
 * Drafting as the web app and MCP use it: an offer URL fills the gaps in the job context from the
 * local index (the page itself is never fetched), and the answers a draft used come back in full.
 */

export type ComposedDrafts = {
  drafts: Record<string, DraftResult>
  /** The saved answers named in any draft's basedOn, by id */
  sources: Record<string, AnswerView>
  /** True when the offer text came from the index */
  jobFromIndex: boolean
  company: string | null
  jobTitle: string | null
}

/** The context with company, title and text filled in from the indexed offer behind its URL. */
export async function withIndexedJob(
  context: DraftContext
): Promise<{ context: DraftContext; fromIndex: boolean }> {
  const url = context.url?.trim()
  if (!url || (context.jobText?.trim() && context.company?.trim() && context.jobTitle?.trim())) {
    return { context, fromIndex: false }
  }
  const job = await findJobByUrl(url).catch(() => null)
  if (!job) return { context, fromIndex: false }
  const text = context.jobText?.trim()
    ? null
    : await db.job.findUnique({ where: { id: job.id }, select: { descriptionText: true } })
  return {
    context: {
      ...context,
      company: context.company?.trim() || job.company.name,
      jobTitle: context.jobTitle?.trim() || job.title,
      jobText: context.jobText?.trim() || text?.descriptionText || null,
    },
    fromIndex: Boolean(text?.descriptionText),
  }
}

export async function composeDrafts(input: {
  userId: number
  questions: DraftQuestion[]
  context?: DraftContext
  language?: "pl" | "en"
}): Promise<ComposedDrafts> {
  const { context, fromIndex } = await withIndexedJob(input.context ?? {})
  const drafts = await draftAnswers({
    userId: input.userId,
    questions: input.questions,
    context,
    language: input.language,
  })
  const ids = [...new Set(Object.values(drafts).flatMap((draft) => draft.basedOn))]
  const rows = ids.length
    ? await db.answer.findMany({ where: { userId: input.userId, id: { in: ids } } })
    : []
  return {
    drafts,
    sources: Object.fromEntries(rows.map((row) => [row.id, toAnswerView(row)])),
    jobFromIndex: fromIndex,
    company: context.company?.trim() || null,
    jobTitle: context.jobTitle?.trim() || null,
  }
}
