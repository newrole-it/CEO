import type { Prisma } from "@prisma/client"
import db from "db"
import type { MatchComment } from "@newrole/cv-core/match"

/**
 * What the person said about themselves on points of a match (CandidateFact). Each is their own
 * data from then on: candidateContext (src/server/profile/context.ts) gives it to every model
 * that writes for them, and the checks count it as evidence. The profile lists them so the person
 * can take one back.
 */

type Writer = Prisma.TransactionClient | typeof db

export type FactView = {
  id: string
  text: string
  /** The point of the match it answers, as the match showed it */
  topic: string | null
  /** The offer whose match it was written on, while it is in the index */
  job: { id: string; title: string; company: string } | null
  createdAt: Date
}

/** The person's facts, newest first. */
export async function listFacts(userId: number): Promise<FactView[]> {
  const rows = await db.candidateFact.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      text: true,
      topic: true,
      createdAt: true,
      job: { select: { id: true, title: true, company: { select: { name: true } } } },
    },
  })
  return rows.map((row) => ({
    id: row.id,
    text: row.text,
    topic: row.topic,
    job: row.job ? { id: row.job.id, title: row.job.title, company: row.job.company.name } : null,
    createdAt: row.createdAt,
  }))
}

/**
 * A round's comments kept as facts, when the next round starts. A comment whose text the person
 * already has as a fact is not kept twice, so starting a round again after a failure adds nothing.
 */
export async function keepCommentsAsFacts(
  userId: number,
  jobId: string | null,
  comments: MatchComment[],
  client: Writer = db
): Promise<number> {
  if (!comments.length) return 0
  const known = await client.candidateFact.findMany({
    where: { userId, text: { in: comments.map((comment) => comment.text) } },
    select: { text: true },
  })
  const seen = new Set(known.map((row) => row.text))
  const fresh = comments.filter((comment) => {
    if (seen.has(comment.text)) return false
    seen.add(comment.text)
    return true
  })
  if (!fresh.length) return 0
  await client.candidateFact.createMany({
    data: fresh.map((comment) => ({
      userId,
      text: comment.text,
      topic: (comment.subject || comment.key).slice(0, 600),
      jobId,
    })),
  })
  return fresh.length
}

/** Takes one fact back. False when the person has no such fact. */
export async function deleteFact(userId: number, id: string): Promise<boolean> {
  const { count } = await db.candidateFact.deleteMany({ where: { id, userId } })
  return count > 0
}
