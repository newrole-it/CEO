import { Prisma } from "@prisma/client"
import db from "db"
import {
  parseMatchComments,
  withComment,
  type MatchComment,
  type MatchCommentKind,
} from "@newrole/cv-core/match"
import { parseTailorNotes, type TailorNotes } from "@newrole/cv-core/tailor"
import { CvError } from "./service"

/**
 * The rounds of the match of a CV written for an offer (MatchRound). Every run of "Dostosuj CV"
 * and every "Popraw CV i sprawdź ponownie" adds one with what its steps found; the person comments
 * on the newest one, and the next round works from those comments. An earlier round never changes.
 * A CV tailored before rounds were kept gets its first round from the notes it has.
 */

type Writer = Prisma.TransactionClient | typeof db

export type RoundSummary = {
  number: number
  score: number | null
  atsScore: number | null
  comments: number
  createdAt: Date
}

export type MatchRoundView = {
  number: number
  notes: TailorNotes
  comments: MatchComment[]
  createdAt: Date
}

function roundData(userId: number, documentId: string, number: number, notes: TailorNotes) {
  return {
    userId,
    documentId,
    number,
    notes: notes as unknown as Prisma.InputJsonValue,
    score: notes.match?.report?.score ?? null,
    atsScore: notes.match?.ats.after.score ?? null,
  }
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

/**
 * A new round with these notes. `before` is what the document kept until this write: when it has
 * no round yet and those notes have a match, they become round 1 first, so nothing is lost.
 */
export async function appendRound(
  tx: Writer,
  input: {
    userId: number
    documentId: string
    notes: TailorNotes
    before?: { notes: unknown; at: Date } | null
  }
): Promise<number> {
  const { userId, documentId, notes, before } = input
  const last = await tx.matchRound.findFirst({
    where: { documentId },
    orderBy: { number: "desc" },
    select: { number: true },
  })
  let number = last?.number ?? 0
  const earlier = last ? null : parseTailorNotes(before?.notes)
  if (earlier?.match) {
    number = 1
    await tx.matchRound.create({
      data: { ...roundData(userId, documentId, 1, earlier), createdAt: before?.at },
    })
  }
  await tx.matchRound.create({ data: roundData(userId, documentId, number + 1, notes) })
  return number + 1
}

/** The person's CV for an offer, with what it keeps of its match. */
async function tailoredDocument(userId: number, documentId: string) {
  return db.cvDocument.findFirst({
    where: { id: documentId, userId, docType: "CV", jobId: { not: null } },
    select: { id: true, jobId: true, tailorNotes: true, updatedAt: true },
  })
}

/**
 * The document's rounds, the first one made from its notes when it has none yet. Null when the
 * person has no such CV for an offer.
 */
export async function listRounds(
  userId: number,
  documentId: string
): Promise<RoundSummary[] | null> {
  const document = await tailoredDocument(userId, documentId)
  if (!document) return null
  const read = () =>
    db.matchRound.findMany({
      where: { documentId },
      orderBy: { number: "asc" },
      select: { number: true, score: true, atsScore: true, comments: true, createdAt: true },
    })
  let rows = await read()
  const notes = rows.length ? null : parseTailorNotes(document.tailorNotes)
  if (notes?.match) {
    try {
      await db.matchRound.create({
        data: { ...roundData(userId, documentId, 1, notes), createdAt: document.updatedAt },
      })
    } catch (error) {
      // another request made it first
      if (!isUniqueError(error)) throw error
    }
    rows = await read()
  }
  return rows.map((row) => ({
    number: row.number,
    score: row.score,
    atsScore: row.atsScore,
    comments: parseMatchComments(row.comments).length,
    createdAt: row.createdAt,
  }))
}

/** One round of the document, the newest when `number` is not given. */
export async function getRound(
  userId: number,
  documentId: string,
  number?: number
): Promise<MatchRoundView | null> {
  const row = await db.matchRound.findFirst({
    where: { documentId, userId, ...(number ? { number } : {}) },
    orderBy: { number: "desc" },
    select: { number: true, notes: true, comments: true, createdAt: true },
  })
  const notes = parseTailorNotes(row?.notes)
  if (!row || !notes) return null
  return {
    number: row.number,
    notes,
    comments: parseMatchComments(row.comments),
    createdAt: row.createdAt,
  }
}

/**
 * Puts the person's comment on one point of the newest round, in place of an earlier one; empty
 * text takes it out. An earlier round is closed: its comments went into the round after it.
 */
export async function saveMatchComment(
  userId: number,
  input: {
    documentId: string
    round: number
    kind: MatchCommentKind
    key: string
    subject: string
    text: string
  }
): Promise<MatchComment[]> {
  const document = await tailoredDocument(userId, input.documentId)
  if (!document) throw new CvError("not-found", "CV not found.")
  return db.$transaction(async (tx) => {
    const newest = await tx.matchRound.findFirst({
      where: { documentId: document.id },
      orderBy: { number: "desc" },
      select: { id: true, number: true, comments: true },
    })
    if (!newest || newest.number !== input.round)
      throw new CvError("conflict", "Only the newest round takes comments.")
    const comments = withComment(parseMatchComments(newest.comments), {
      kind: input.kind,
      key: input.key,
      subject: input.subject,
      text: input.text,
      at: new Date().toISOString(),
    })
    await tx.matchRound.update({
      where: { id: newest.id },
      data: { comments: comments as unknown as Prisma.InputJsonValue },
      select: { id: true },
    })
    return comments
  })
}

export type MatchScore = { score: number | null; atsScore: number | null; rounds: number }

/**
 * The newest match of each of these CVs, for lists of offers and applications. A CV whose rounds
 * were never listed reads its notes instead.
 */
export async function matchScores(
  userId: number,
  documentIds: string[]
): Promise<Map<string, MatchScore>> {
  const found = new Map<string, MatchScore>()
  if (!documentIds.length) return found
  const rounds = await db.matchRound.findMany({
    where: { userId, documentId: { in: documentIds } },
    orderBy: { number: "desc" },
    select: { documentId: true, number: true, score: true, atsScore: true },
  })
  for (const row of rounds) {
    // newest first: the first row of a document is its newest round
    if (!found.has(row.documentId))
      found.set(row.documentId, { score: row.score, atsScore: row.atsScore, rounds: row.number })
  }
  const missing = documentIds.filter((id) => !found.has(id))
  if (missing.length) {
    const documents = await db.cvDocument.findMany({
      where: { userId, id: { in: missing }, docType: "CV" },
      select: { id: true, tailorNotes: true },
    })
    for (const document of documents) {
      const match = parseTailorNotes(document.tailorNotes)?.match
      if (match)
        found.set(document.id, {
          score: match.report?.score ?? null,
          atsScore: match.ats.after.score ?? null,
          rounds: 1,
        })
    }
  }
  return found
}

/** The newest match of the CV written for each of these offers, by the offer's id. */
export async function matchScoresByJob(
  userId: number,
  jobIds: string[]
): Promise<Record<string, MatchScore>> {
  if (!jobIds.length) return {}
  const documents = await db.cvDocument.findMany({
    where: { userId, docType: "CV", jobId: { in: jobIds } },
    select: { id: true, jobId: true },
  })
  const scores = await matchScores(
    userId,
    documents.map((document) => document.id)
  )
  const byJob: Record<string, MatchScore> = {}
  for (const document of documents) {
    const score = scores.get(document.id)
    if (document.jobId && score) byJob[document.jobId] = score
  }
  return byJob
}
