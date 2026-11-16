import db from "db"
import { DELETED_STATUS } from "src/shared/applications"
import { calendarDays, computeFollowups, type Followups } from "./followups"
import { computePatterns, type PatternApplication, type Patterns } from "./patterns"
import { loadInsightsInput } from "./service"

/**
 * The rows src/server/applications/patterns.ts and followups.ts count, read for one person: each
 * application with what it was sent with (the CV and its match score, a letter, the offer's
 * work mode, publisher and age, the offer's evaluation). Nothing is stored.
 */

const WORKPLACES = new Set(["REMOTE", "HYBRID", "ONSITE"])
const DECISIONS = new Set(["apply", "consider", "skip", "unknown"])

export async function loadPatternApplications(userId: number): Promise<PatternApplication[]> {
  const rows = await db.application.findMany({
    where: { userId, status: { not: DELETED_STATUS } },
    orderBy: { appliedAt: "desc" },
    select: {
      id: true,
      company: true,
      title: true,
      status: true,
      closedAtStage: true,
      appliedAt: true,
      statusChangedAt: true,
      nextStep: true,
      nextStepAt: true,
      source: true,
      jobId: true,
      cvDocumentId: true,
      cvDocument: { select: { jobId: true } },
      job: {
        select: {
          workplaceType: true,
          viaIntermediary: true,
          publishedAt: true,
          firstSeenAt: true,
        },
      },
      events: {
        orderBy: { at: "asc" },
        select: { type: true, toStatus: true, at: true, channel: true },
      },
    },
  })
  const jobIds = [...new Set(rows.flatMap((row) => (row.jobId ? [row.jobId] : [])))]
  const cvIds = [...new Set(rows.flatMap((row) => (row.cvDocumentId ? [row.cvDocumentId] : [])))]
  const [letters, rounds, evaluations] = await Promise.all([
    jobIds.length
      ? db.cvDocument.findMany({
          where: { userId, docType: "LETTER", jobId: { in: jobIds } },
          select: { jobId: true },
        })
      : [],
    cvIds.length
      ? db.matchRound.findMany({
          where: { userId, documentId: { in: cvIds } },
          orderBy: { number: "desc" },
          select: { documentId: true, score: true },
        })
      : [],
    jobIds.length
      ? db.offerEvaluation.findMany({
          where: { userId, jobId: { in: jobIds } },
          select: { jobId: true, decision: true },
        })
      : [],
  ])
  const withLetter = new Set(letters.map((letter) => letter.jobId))
  const score = new Map<string, number | null>()
  // newest round first: the first one seen for a document is its score
  for (const round of rounds)
    if (!score.has(round.documentId)) score.set(round.documentId, round.score)
  const decision = new Map(evaluations.map((row) => [row.jobId, row.decision]))

  return rows.map((row) => {
    const posted = row.job ? (row.job.publishedAt ?? row.job.firstSeenAt) : null
    const evaluated = row.jobId ? decision.get(row.jobId) : undefined
    return {
      id: row.id,
      status: row.status,
      closedAtStage: row.closedAtStage,
      appliedAt: row.appliedAt.toISOString(),
      statusChangedAt: row.statusChangedAt.toISOString(),
      source: row.source,
      events: row.events.map((event) => ({ ...event, at: event.at.toISOString() })),
      matchScore: row.cvDocumentId ? (score.get(row.cvDocumentId) ?? null) : null,
      cv: row.cvDocumentId
        ? row.jobId && row.cvDocument?.jobId === row.jobId
          ? "tailored"
          : "general"
        : null,
      letter: row.jobId ? withLetter.has(row.jobId) : null,
      workplace:
        row.job && WORKPLACES.has(row.job.workplaceType)
          ? (row.job.workplaceType as PatternApplication["workplace"])
          : null,
      intermediary: row.job ? row.job.viaIntermediary : null,
      postingAgeDays: posted ? calendarDays(posted, row.appliedAt) : null,
      evaluation:
        evaluated && DECISIONS.has(evaluated)
          ? (evaluated as PatternApplication["evaluation"])
          : null,
    }
  })
}

/** The patterns of one person's applications, counted now. */
export async function loadPatterns(userId: number, now: Date = new Date()): Promise<Patterns> {
  return computePatterns(await loadPatternApplications(userId), { now })
}

/** Who is due a follow-up, from the same rows the statistics count. */
export async function loadFollowups(userId: number, now: Date = new Date()): Promise<Followups> {
  const { applications } = await loadInsightsInput(userId)
  return computeFollowups(applications, { now })
}
