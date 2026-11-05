import db from "db"
import type { FeedbackVerdict } from "src/shared/feedback-aspects"
import { isVerdict, listFeedback } from "./feedback"

/**
 * "Zapisane": the offers a person kept, as the steps of one funnel, each offer in one tab. A CV or
 * letter written for an offer puts it here even without a Like, and adds no Like: verdicts teach
 * the preference model (model.ts), so only the person sets them.
 */

export const SAVED_SEGMENTS = ["liked", "ready", "applied", "passed"] as const
export type SavedSegment = (typeof SAVED_SEGMENTS)[number]

export function isSavedSegment(value: unknown): value is SavedSegment {
  return typeof value === "string" && (SAVED_SEGMENTS as readonly string[]).includes(value)
}

export type SavedDocument = { id: string; language: "pl" | "en"; updatedAt: Date }

export type SavedOffer = {
  jobId: string
  title: string
  company: string
  url: string | null
  closed: boolean
  verdict: FeedbackVerdict | null
  note: string | null
  tags: string[]
  /** The newest of the verdict and the documents */
  at: Date
  cv: SavedDocument | null
  letter: SavedDocument | null
  applicationId: string | null
}

/** Applied and passed win over a document: a sent CV is no longer waiting, a passed offer is gone. */
export function segmentOf(state: {
  verdict: FeedbackVerdict | null
  documents: boolean
  application: boolean
}): SavedSegment | null {
  if (state.verdict === "APPLIED") return "applied"
  if (state.verdict === "DISLIKE") return "passed"
  if (state.application) return "applied"
  if (state.documents) return "ready"
  return state.verdict === "LIKE" ? "liked" : null
}

type Documents = { cv: SavedDocument | null; letter: SavedDocument | null }

const newest = (dates: (Date | null | undefined)[]) =>
  new Date(Math.max(...dates.map((date) => date?.getTime() ?? 0)))

export async function listSaved(
  userId: number,
  segment: SavedSegment,
  limit = 300
): Promise<{ offers: SavedOffer[]; counts: Record<SavedSegment, number> }> {
  const [verdicts, documents, applications] = await Promise.all([
    db.offerFeedback.findMany({
      where: { userId },
      select: { jobId: true, verdict: true, updatedAt: true },
    }),
    db.cvDocument.findMany({
      where: { userId, jobId: { not: null } },
      select: { id: true, jobId: true, docType: true, language: true, updatedAt: true },
    }),
    db.application.findMany({
      where: { userId, jobId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, jobId: true },
    }),
  ])

  const verdictOf = new Map(verdicts.map((row) => [row.jobId, row]))
  const docsOf = new Map<string, Documents>()
  for (const row of documents) {
    if (!row.jobId) continue
    const docs = docsOf.get(row.jobId) ?? { cv: null, letter: null }
    const doc = {
      id: row.id,
      language: row.language === "en" ? "en" : "pl",
      updatedAt: row.updatedAt,
    } as const
    if (row.docType === "LETTER") docs.letter = doc
    else docs.cv = doc
    docsOf.set(row.jobId, docs)
  }
  const applicationOf = new Map<string, string>()
  for (const row of applications) {
    if (row.jobId && !applicationOf.has(row.jobId)) applicationOf.set(row.jobId, row.id)
  }

  const counts: Record<SavedSegment, number> = { liked: 0, ready: 0, applied: 0, passed: 0 }
  const picked: { jobId: string; at: Date }[] = []
  for (const jobId of new Set([...verdictOf.keys(), ...docsOf.keys()])) {
    const feedback = verdictOf.get(jobId)
    const docs = docsOf.get(jobId)
    const found = segmentOf({
      verdict: feedback && isVerdict(feedback.verdict) ? feedback.verdict : null,
      documents: Boolean(docs?.cv || docs?.letter),
      application: applicationOf.has(jobId),
    })
    if (!found) continue
    counts[found] += 1
    if (found === segment) {
      picked.push({
        jobId,
        at: newest([feedback?.updatedAt, docs?.cv?.updatedAt, docs?.letter?.updatedAt]),
      })
    }
  }
  picked.sort((a, b) => b.at.getTime() - a.at.getTime())
  const page = picked.slice(0, limit)
  const ids = page.map((row) => row.jobId)

  const [views, jobs] = await Promise.all([
    ids.length ? listFeedback(userId, { jobIds: ids, limit: ids.length }) : [],
    ids.length
      ? db.job.findMany({
          where: { id: { in: ids.filter((id) => !verdictOf.has(id)) } },
          select: {
            id: true,
            title: true,
            originalUrl: true,
            canonicalUrl: true,
            status: true,
            company: { select: { name: true } },
          },
        })
      : [],
  ])
  const viewOf = new Map(views.map((view) => [view.jobId, view]))
  const jobOf = new Map(jobs.map((job) => [job.id, job]))

  const offers = page.flatMap(({ jobId, at }): SavedOffer[] => {
    const docs = docsOf.get(jobId) ?? { cv: null, letter: null }
    const base = { jobId, at, ...docs, applicationId: applicationOf.get(jobId) ?? null }
    const view = viewOf.get(jobId)
    if (view) {
      return [
        {
          ...base,
          title: view.job?.title ?? "—",
          company: view.job?.company ?? "",
          url: view.job?.url || null,
          closed: view.job ? view.job.status !== "ACTIVE" : true,
          verdict: view.verdict,
          note: view.note,
          tags: view.tags,
        },
      ]
    }
    const job = jobOf.get(jobId)
    if (!job) return []
    return [
      {
        ...base,
        title: job.title,
        company: job.company.name,
        url: job.originalUrl || job.canonicalUrl || null,
        closed: job.status !== "ACTIVE",
        verdict: null,
        note: null,
        tags: [],
      },
    ]
  })
  return { offers, counts }
}

export type OfferStage = {
  segment: SavedSegment | null
  closed: boolean
  applicationId: string | null
}

/** The Zapisane tab of offers that have documents written for them, for the CV list. */
export async function offerStages(
  userId: number,
  jobIds: string[]
): Promise<Record<string, OfferStage>> {
  const ids = [...new Set(jobIds)]
  if (!ids.length) return {}
  const [verdicts, applications, jobs] = await Promise.all([
    db.offerFeedback.findMany({
      where: { userId, jobId: { in: ids } },
      select: { jobId: true, verdict: true },
    }),
    db.application.findMany({
      where: { userId, jobId: { in: ids } },
      orderBy: { createdAt: "asc" },
      select: { id: true, jobId: true },
    }),
    db.job.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } }),
  ])
  const verdictOf = new Map(verdicts.map((row) => [row.jobId, row.verdict]))
  const applicationOf = new Map<string, string>()
  for (const row of applications) {
    if (row.jobId && !applicationOf.has(row.jobId)) applicationOf.set(row.jobId, row.id)
  }
  const statusOf = new Map(jobs.map((row) => [row.id, row.status]))
  const stages: Record<string, OfferStage> = {}
  for (const jobId of ids) {
    const verdict = verdictOf.get(jobId)
    stages[jobId] = {
      segment: segmentOf({
        verdict: isVerdict(verdict) ? verdict : null,
        documents: true,
        application: applicationOf.has(jobId),
      }),
      closed: statusOf.has(jobId) ? statusOf.get(jobId) !== "ACTIVE" : true,
      applicationId: applicationOf.get(jobId) ?? null,
    }
  }
  return stages
}
