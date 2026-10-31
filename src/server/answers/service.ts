import db, { type Answer, type Prisma } from "db"
import { fold } from "matching/text"
import { parseFormAnswers } from "src/server/applications/logic"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import { parseApplicant } from "src/shared/applicant"
import {
  DRAFT_SYSTEM,
  DraftOutputSchema,
  draftMaxTokens,
  draftUserPrompt,
  featureCache,
  finalizeDraft,
  MAX_DRAFT_QUESTIONS,
  MAX_SIMILAR_PER_QUESTION,
  MIN_SIMILAR_SCORE,
  pickReuse,
  rankAnswers,
  type PendingQuestion,
} from "./draft"
import {
  cleanTags,
  cleanText,
  MAX_ANSWER_LENGTH,
  MAX_QUESTION_LENGTH,
  normalizeAnswer,
  personalNames,
  personalValues,
  queryMatch,
  queryTerms,
  selectFormPairs,
} from "./filter"
import { detectLanguage, normalizeText, questionKey } from "./similarity"
import {
  isAnswerLanguage,
  isAnswerOrigin,
  type AnswerOrigin,
  type AnswerView,
  type DraftContext,
  type DraftQuestion,
  type DraftResult,
  type ScoredAnswer,
} from "./types"

/**
 * The answer bank: questions from application forms with the person's answers, grouped into
 * variants by questionKey. Contract for the web app, MCP and the Chrome extension API:
 * docs/product/plan-aplikacje.md §5.2.
 */

export { detectLanguage, questionKey }
export type { AnswerOrigin, AnswerView, DraftContext, DraftQuestion, DraftResult, ScoredAnswer }

export type AnswerErrorCode = "not-found" | "invalid"

export class AnswerError extends Error {
  code: AnswerErrorCode
  constructor(code: AnswerErrorCode, message: string) {
    super(message)
    this.name = "AnswerError"
    this.code = code
  }
}

/** Answers per person kept in memory for search and ranking; a bank is hundreds, not millions. */
const POOL_LIMIT = 2000
/** searchAnswers({ question }) drops matches below this score. */
export const MIN_SEARCH_SCORE = 0.15
const MAX_FORM_PAIRS = 100

export function toAnswerView(row: Answer): AnswerView {
  return {
    id: row.id,
    question: row.question,
    questionKey: row.questionKey,
    answer: row.answer,
    tags: cleanTags(row.tags),
    language: row.language,
    company: row.company,
    jobTitle: row.jobTitle,
    sourceUrl: row.sourceUrl,
    applicationId: row.applicationId,
    origin: isAnswerOrigin(row.origin) ? row.origin : "manual",
    useCount: row.useCount,
    lastUsedAt: row.lastUsedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

async function pool(userId: number): Promise<AnswerView[]> {
  const rows = await db.answer.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: POOL_LIMIT,
  })
  return rows.map(toAnswerView)
}

function shortText(value: string | null | undefined, max = 300): string | null {
  const text = value?.replace(/\s+/g, " ").trim()
  return text ? text.slice(0, max) : null
}

/** The application id when it is the person's own, else null. */
async function ownApplicationId(
  userId: number,
  id: string | null | undefined
): Promise<string | null> {
  if (!id) return null
  const row = await db.application.findFirst({ where: { id, userId }, select: { id: true } })
  return row?.id ?? null
}

/**
 * Search the bank. With `question`: ranked by similarity to it (deterministic, PL/EN), each row
 * with `score` in [0, 1], weak matches dropped. With `q`: rows whose question, answer, company,
 * job title or tags contain every word, question hits first. Neither: newest first.
 * `tag` filters by tag (ignoring case and accents). Default limit 50, at most 500.
 */
export async function searchAnswers(
  userId: number,
  opts: { q?: string; question?: string; tag?: string; limit?: number }
): Promise<(AnswerView & { score?: number })[]> {
  const limit = Math.max(1, Math.min(500, Math.floor(opts.limit ?? 50)))
  let rows = await pool(userId)
  const tag = opts.tag?.trim()
  if (tag) rows = rows.filter((row) => row.tags.some((item) => fold(item) === fold(tag)))
  const terms = queryTerms(opts.q)
  if (terms.length) {
    rows = rows
      .map((row, index) => ({ row, index, match: queryMatch(row, terms) }))
      .filter((item) => item.match > 0)
      .sort((a, b) => b.match - a.match || a.index - b.index)
      .map((item) => item.row)
  }
  const question = opts.question?.trim()
  if (question) {
    return rankAnswers(question, rows, featureCache(), MIN_SEARCH_SCORE)
      .slice(0, limit)
      .map(({ row, score }) => ({ ...row, score }))
  }
  return rows.slice(0, limit)
}

export type AnswerBankStats = {
  total: number
  questions: number
  /** Stored answers per questionKey, independent of any search */
  variants: Record<string, number>
  /** Every tag in use, the most common first */
  tags: { tag: string; count: number }[]
}

/** Counts for the /answers header, the variant badges and the tag filter. */
export async function answerBankStats(userId: number): Promise<AnswerBankStats> {
  const rows = await db.answer.findMany({
    where: { userId },
    select: { questionKey: true, tags: true },
    // Newest first, so the newest spelling of a tag is the one shown.
    orderBy: { updatedAt: "desc" },
    take: POOL_LIMIT,
  })
  const variants: Record<string, number> = {}
  const tags = new Map<string, { tag: string; count: number }>()
  for (const row of rows) {
    variants[row.questionKey] = (variants[row.questionKey] ?? 0) + 1
    for (const tag of cleanTags(row.tags)) {
      const key = fold(tag)
      const entry = tags.get(key)
      if (entry) entry.count += 1
      else tags.set(key, { tag, count: 1 })
    }
  }
  return {
    total: rows.length,
    questions: Object.keys(variants).length,
    variants,
    tags: [...tags.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "pl")),
  }
}

/** One answer of the person, or null. */
export async function getAnswer(userId: number, id: string): Promise<AnswerView | null> {
  const row = await db.answer.findFirst({ where: { id, userId } })
  return row ? toAnswerView(row) : null
}

/** Every variant stored for a question key, the most used first. */
export async function answerVariants(userId: number, key: string): Promise<AnswerView[]> {
  const rows = await db.answer.findMany({
    where: { userId, questionKey: key },
    orderBy: [{ useCount: "desc" }, { updatedAt: "desc" }],
    take: 100,
  })
  return rows.map(toAnswerView)
}

/** Answers given in one application (the tracker's detail drawer shows them). */
export async function answersForApplication(
  userId: number,
  applicationId: string
): Promise<AnswerView[]> {
  const rows = await db.answer.findMany({
    where: { userId, applicationId },
    orderBy: { createdAt: "asc" },
    take: 200,
  })
  return rows.map(toAnswerView)
}

/**
 * Every application this answer was given in, the newest first. The bank row stays linked to the
 * first one only, so the forms kept on the applications say where else it went.
 */
export async function answerOffers(
  userId: number,
  answer: Pick<AnswerView, "question" | "answer" | "applicationId">
): Promise<{ id: string; company: string; title: string }[]> {
  const rows = await db.application.findMany({
    where: { userId },
    orderBy: { appliedAt: "desc" },
    select: { id: true, company: true, title: true, formAnswers: true },
  })
  const key = questionKey(answer.question)
  const normal = normalizeAnswer(answer.answer)
  return rows
    .filter(
      (row) =>
        row.id === answer.applicationId ||
        parseFormAnswers(row.formAnswers).some(
          (item) => questionKey(item.question) === key && normalizeAnswer(item.answer) === normal
        )
    )
    .map(({ id, company, title }) => ({ id, company, title }))
}

/**
 * Create or update an answer. With `id` it updates that row (the origin stays what it was).
 * Without `id`, an existing row with the same questionKey and the same answer (ignoring case,
 * accents, spacing and punctuation) only gets useCount + 1 and lastUsedAt, and created is false;
 * a different answer to the same question becomes a new variant.
 */
export async function saveAnswer(input: {
  userId: number
  id?: string
  question: string
  answer: string
  tags?: string[]
  language?: string | null
  company?: string | null
  jobTitle?: string | null
  sourceUrl?: string | null
  applicationId?: string | null
  origin: AnswerOrigin
}): Promise<{ answer: AnswerView; created: boolean }> {
  const question = cleanText(input.question ?? "", MAX_QUESTION_LENGTH)
  const answer = cleanText(input.answer ?? "", MAX_ANSWER_LENGTH)
  if (!question || !answer)
    throw new AnswerError("invalid", "Both the question and the answer are required.")
  const key =
    questionKey(question) || normalizeText(question).slice(0, 300) || question.slice(0, 300)
  const language = isAnswerLanguage(input.language)
    ? input.language
    : detectLanguage(`${question}\n${answer}`)
  const origin: AnswerOrigin = isAnswerOrigin(input.origin) ? input.origin : "manual"

  if (input.id) {
    const existing = await db.answer.findFirst({ where: { id: input.id, userId: input.userId } })
    if (!existing) throw new AnswerError("not-found", `No answer with id ${input.id}.`)
    const data: Prisma.AnswerUncheckedUpdateInput = { question, questionKey: key, answer, language }
    if (input.tags !== undefined) data.tags = cleanTags(input.tags)
    if (input.company !== undefined) data.company = shortText(input.company, 200)
    if (input.jobTitle !== undefined) data.jobTitle = shortText(input.jobTitle, 200)
    if (input.sourceUrl !== undefined) data.sourceUrl = shortText(input.sourceUrl, 1000)
    if (input.applicationId !== undefined)
      data.applicationId = await ownApplicationId(input.userId, input.applicationId)
    const row = await db.answer.update({ where: { id: existing.id }, data })
    return { answer: toAnswerView(row), created: false }
  }

  const applicationId = await ownApplicationId(input.userId, input.applicationId)
  const normal = normalizeAnswer(answer)
  const variants = await db.answer.findMany({ where: { userId: input.userId, questionKey: key } })
  const same = variants.find((row) => normalizeAnswer(row.answer) === normal)
  if (same) {
    const tags = cleanTags([...cleanTags(same.tags), ...(input.tags ?? [])])
    const row = await db.answer.update({
      where: { id: same.id },
      data: {
        useCount: { increment: 1 },
        lastUsedAt: new Date(),
        tags,
        // An answer reused in a new application stays linked to the first one; fill the gap only.
        ...(applicationId && !same.applicationId ? { applicationId } : {}),
        ...(!same.company && input.company ? { company: shortText(input.company, 200) } : {}),
        ...(!same.jobTitle && input.jobTitle ? { jobTitle: shortText(input.jobTitle, 200) } : {}),
      },
    })
    return { answer: toAnswerView(row), created: false }
  }

  const row = await db.answer.create({
    data: {
      userId: input.userId,
      question,
      questionKey: key,
      answer,
      tags: cleanTags(input.tags ?? []),
      language,
      company: shortText(input.company, 200),
      jobTitle: shortText(input.jobTitle, 200),
      sourceUrl: shortText(input.sourceUrl, 1000),
      applicationId,
      origin,
      useCount: 1,
      lastUsedAt: origin === "extension" ? new Date() : null,
    },
  })
  return { answer: toAnswerView(row), created: true }
}

/** The person's own details, to keep them out of stored answers. */
export async function formPrivacy(
  userId: number
): Promise<{ personal: string[]; names: string[] }> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, applicant: true },
  })
  const details = {
    name: user?.name,
    email: user?.email,
    applicant: parseApplicant(user?.applicant),
  }
  return { personal: personalValues(details), names: personalNames(details) }
}

/**
 * Store the open answers from a submitted application form (origin "extension"), linked to the
 * application, company, job title and page URL. Skips empty and one-character answers, contact
 * and identity data (name, email, phone, address, profile links, the person's own details),
 * consent and EEO questions, file names and checkbox values. Salary expectations are kept.
 * saved = new rows (new questions or new variants), reused = identical answers counted again.
 */
export async function recordFormAnswers(input: {
  userId: number
  applicationId?: string | null
  company?: string | null
  jobTitle?: string | null
  sourceUrl?: string | null
  pairs: { question: string; answer: string }[]
}): Promise<{ saved: number; reused: number }> {
  const { personal, names } = await formPrivacy(input.userId)
  const { keep } = selectFormPairs(input.pairs.slice(0, MAX_FORM_PAIRS), personal, names)
  let saved = 0
  let reused = 0
  for (const pair of keep) {
    const result = await saveAnswer({
      userId: input.userId,
      question: pair.question,
      answer: pair.answer,
      company: input.company,
      jobTitle: input.jobTitle,
      sourceUrl: input.sourceUrl,
      applicationId: input.applicationId,
      origin: "extension",
    })
    if (result.created) saved += 1
    else reused += 1
  }
  return { saved, reused }
}

export async function deleteAnswer(userId: number, id: string): Promise<void> {
  const { count } = await db.answer.deleteMany({ where: { id, userId } })
  if (!count) throw new AnswerError("not-found", `No answer with id ${id}.`)
}

/**
 * Draft answers for a batch of questions (a form, or one question from the web app or MCP).
 * Each question first tries reuse: a stored answer with similarity ≥ 0.85, the same language,
 * not naming a different company, within maxChars (and one of the options, when given) comes
 * back verbatim as reader "reuse". The rest go to the writing model (CLAUDE_WRITING_MODEL) in
 * ONE completeJson call with the candidate's profile and CV, up to 5 similar past answers per
 * question and the job context. Purpose is "form-fill" when any question carries select options
 * (a form), otherwise "answer-draft"; both are personal, so the cache is per user.
 * Language: `language` when given, else the language of each question.
 * With no model (or a failed call) the remaining questions get reader "none" and empty text.
 */
export async function draftAnswers(input: {
  userId: number
  questions: { key: string; question: string; maxChars?: number; options?: string[] }[]
  context?: {
    company?: string | null
    jobTitle?: string | null
    jobText?: string | null
    url?: string | null
  }
  language?: "pl" | "en"
}): Promise<Record<string, DraftResult>> {
  const results: Record<string, DraftResult> = {}
  const questions = input.questions
    .filter((item) => item.key && item.question?.trim())
    .slice(0, MAX_DRAFT_QUESTIONS)
  if (!questions.length) return results

  const rows = await pool(input.userId)
  const features = featureCache()
  const pending: (PendingQuestion & { key: string })[] = []
  for (const item of questions) {
    const question = cleanText(item.question, MAX_QUESTION_LENGTH)
    const language = input.language ?? detectLanguage(question)
    const maxChars = item.maxChars && item.maxChars > 0 ? Math.floor(item.maxChars) : undefined
    const options = item.options
      ?.map((option) => option.trim())
      .filter(Boolean)
      .slice(0, 60)
    const ranked = rankAnswers(question, rows, features, 0)
    const reuse = pickReuse(ranked, {
      language,
      maxChars,
      options,
      company: input.context?.company,
    })
    if (reuse) {
      results[item.key] = { text: reuse.text, basedOn: [reuse.row.id], reader: "reuse" }
      continue
    }
    pending.push({
      key: item.key,
      id: `q${pending.length + 1}`,
      question,
      language,
      maxChars,
      options: options?.length ? options : undefined,
      similar: ranked
        .filter((entry) => entry.score >= MIN_SIMILAR_SCORE)
        .slice(0, MAX_SIMILAR_PER_QUESTION),
    })
  }
  if (!pending.length) return results

  const none = () => {
    for (const item of pending) results[item.key] = { text: "", basedOn: [], reader: "none" }
    return results
  }
  const client = createWritingClient()
  if (!client) return none()
  const candidate = await candidateContext(input.userId)
  const reply = await client
    .completeJson({
      purpose: pending.some((item) => item.options?.length) ? "form-fill" : "answer-draft",
      system: DRAFT_SYSTEM,
      user: draftUserPrompt({ candidate, context: input.context, questions: pending }),
      schema: DraftOutputSchema,
      maxTokens: draftMaxTokens(pending),
      userId: input.userId,
    })
    .catch((error: unknown) => {
      console.error("answer draft failed", error instanceof Error ? error.message : error)
      return null
    })
  if (!reply) return none()
  for (const item of pending) {
    const { text, basedOn } = finalizeDraft(item, reply.data.answers[item.id])
    results[item.key] = text
      ? { text, basedOn, reader: "llm" }
      : { text: "", basedOn: [], reader: "none" }
  }
  return results
}
