import { z } from "zod"
import { wrapUntrusted } from "@newrole/llm/common"
import { hasRedaction } from "./filter"
import {
  detectLanguage,
  featureSimilarity,
  normalizeText,
  questionFeatures,
  type QuestionFeatures,
} from "./similarity"
import type { AnswerLanguage, AnswerView, DraftContext } from "./types"

/** Pure parts of draftAnswers: ranking, the reuse rule, the prompt and output cleanup. */

/** A stored answer is reused verbatim at this similarity or above (plus language and company checks). */
export const REUSE_THRESHOLD = 0.85
/** Past answers below this similarity are not shown to the model. */
export const MIN_SIMILAR_SCORE = 0.3
export const MAX_SIMILAR_PER_QUESTION = 5
export const JOB_TEXT_LIMIT = 6000
export const MAX_DRAFT_QUESTIONS = 30

export type Ranked = { row: AnswerView; score: number }

/** Feature cache keyed by question text, so a pool of answers is tokenized once per call. */
export function featureCache() {
  const cache = new Map<string, QuestionFeatures>()
  return (question: string): QuestionFeatures => {
    let hit = cache.get(question)
    if (!hit) {
      hit = questionFeatures(question)
      cache.set(question, hit)
    }
    return hit
  }
}

/** Stored answers ranked by how alike their question is; ties go to the more used, then newer. */
export function rankAnswers(
  question: string,
  rows: AnswerView[],
  features: (question: string) => QuestionFeatures = featureCache(),
  minScore = 0
): Ranked[] {
  const target = features(question)
  return rows
    .map((row) => ({ row, score: featureSimilarity(target, features(row.question)) }))
    .filter((item) => item.score > minScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.row.useCount - a.row.useCount ||
        new Date(b.row.updatedAt).getTime() - new Date(a.row.updatedAt).getTime()
    )
}

const LEGAL_SUFFIX =
  /\b(sp z o o|sp zoo|spolka z ograniczona odpowiedzialnoscia|s a|sa|sp k|sp j|inc|llc|ltd|limited|gmbh|ag|bv|plc|corp|corporation|group|polska|poland)\b/g

/** Company name in comparison form: folded, no punctuation, no legal suffix. */
export function companyKey(company: string | null | undefined): string {
  return normalizeText(company ?? "")
    .replace(LEGAL_SUFFIX, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function mentionsCompany(text: string, company: string | null | undefined): boolean {
  const key = companyKey(company)
  if (key.length < 2) return false
  return ` ${normalizeText(text)} `.includes(` ${key} `)
}

/**
 * True when a stored answer was written for another company and says so: it names its
 * company, and the company we are drafting for is different or unknown.
 */
export function companyMismatch(
  row: Pick<AnswerView, "answer" | "company">,
  company: string | null | undefined
): boolean {
  if (!row.company || !mentionsCompany(row.answer, row.company)) return false
  const target = companyKey(company)
  return !target || target !== companyKey(row.company)
}

export function answerLanguage(row: Pick<AnswerView, "language" | "answer">): AnswerLanguage {
  return row.language === "pl" || row.language === "en" ? row.language : detectLanguage(row.answer)
}

/** The option the text stands for, copied verbatim, or null. */
export function matchOption(text: string, options: string[] | undefined): string | null {
  if (!options?.length) return null
  const wanted = normalizeText(text)
  if (!wanted) return null
  const exact = options.find((option) => normalizeText(option) === wanted)
  if (exact) return exact
  const contained = options.filter((option) => {
    const key = normalizeText(option)
    return key && (` ${wanted} `.includes(` ${key} `) || ` ${key} `.includes(` ${wanted} `))
  })
  return contained.length === 1 ? contained[0] : null
}

/** Cut to maxChars at the last sentence end, else the last word boundary. */
export function fitToLimit(text: string, maxChars: number | undefined): string {
  const clean = text.trim()
  if (!maxChars || maxChars <= 0 || clean.length <= maxChars) return clean
  const head = clean.slice(0, maxChars)
  const sentence = Math.max(
    head.lastIndexOf(". "),
    head.lastIndexOf("! "),
    head.lastIndexOf("? "),
    head.lastIndexOf(".\n")
  )
  if (sentence >= maxChars * 0.5) return head.slice(0, sentence + 1).trim()
  const space = head.lastIndexOf(" ")
  return (space > maxChars * 0.5 ? head.slice(0, space) : head).replace(/[\s,;:–-]+$/, "").trim()
}

/**
 * The stored answer to reuse for a question, or null. Rules: similarity ≥ 0.85, same language,
 * not written for (and naming) a different company, fits maxChars, and with options it must be
 * one of them (the option text is returned verbatim).
 */
export function pickReuse(
  ranked: Ranked[],
  rules: {
    language: AnswerLanguage
    maxChars?: number
    options?: string[]
    company?: string | null
  }
): { row: AnswerView; text: string; score: number } | null {
  for (const item of ranked) {
    if (item.score < REUSE_THRESHOLD) break
    const { row } = item
    if (answerLanguage(row) !== rules.language) continue
    if (companyMismatch(row, rules.company)) continue
    // "[imię i nazwisko]" must not reach an employer: the model drafts from it instead.
    if (hasRedaction(row.answer)) continue
    if (rules.options?.length) {
      const option = matchOption(row.answer, rules.options)
      if (option) return { row, text: option, score: item.score }
      continue
    }
    if (rules.maxChars && row.answer.length > rules.maxChars) continue
    return { row, text: row.answer, score: item.score }
  }
  return null
}

/* ------------------------------------------------------------------ prompt */

export const DraftOutputSchema = z.object({
  answers: z.record(
    z.object({
      text: z.string().max(40_000),
      basedOn: z.array(z.string().max(64)).max(20).optional(),
    })
  ),
})
export type DraftOutput = z.infer<typeof DraftOutputSchema>

export type PendingQuestion = {
  /** Prompt id (q1, q2…): form keys can be anything, so the model never sees them */
  id: string
  question: string
  language: AnswerLanguage
  maxChars?: number
  options?: string[]
  similar: Ranked[]
}

export const DRAFT_SYSTEM = [
  "You draft answers to job application questions for the candidate, in their own voice (first person).",
  "Truthfulness: use only facts present in the candidate context, the candidate's past answers and the job context. Never invent experience, employers, job titles, dates, numbers, metrics, technologies, certificates or education that are not there. When unsure, write a shorter, honest answer instead of guessing.",
  "Prefer the candidate's own wording from past answers when it fits, adapted to this company and role. Never carry over company-specific details from a past answer written for a different company.",
  'Write each answer in the language given for it: "pl" is Polish (natural, professional, no needless anglicisms), "en" is English.',
  "Respect maxChars: the text must not be longer. Without a limit, keep it concise: about 400 to 900 characters for open questions, a single line for short factual ones.",
  "When options are given, the text must be exactly one of the options, copied verbatim.",
  "No placeholders such as [Company], no greetings or sign-offs, no markdown, no surrounding quotes.",
  "basedOn lists the ids of the past answers you actually used (empty when none).",
  'Return JSON: {"answers": {"<question id>": {"text": "...", "basedOn": ["<answer id>"]}}} with one entry per question id.',
].join("\n")

export function wrapLong(label: string, text: string, max: number): string {
  const body = text.slice(0, max)
  const parts: string[] = []
  for (let start = 0; start < body.length; start += 3500)
    parts.push(wrapUntrusted(label, body.slice(start, start + 3500)))
  return parts.join("\n")
}

export function draftUserPrompt(input: {
  candidate: string
  context?: DraftContext
  questions: PendingQuestion[]
}): string {
  const lines: string[] = []
  lines.push("Candidate context (the candidate's own profile and CV):")
  lines.push(
    `<candidate_context>\n${
      input.candidate.trim() || "(empty: no profile or CV yet)"
    }\n</candidate_context>`
  )
  const context = input.context ?? {}
  const job = [
    context.company ? `Company: ${context.company}` : "",
    context.jobTitle ? `Title: ${context.jobTitle}` : "",
    context.url ? `URL: ${context.url}` : "",
  ].filter(Boolean)
  lines.push("", "Job:")
  lines.push(job.length ? wrapUntrusted("job", job.join("\n")) : "(no company or title given)")
  if (context.jobText?.trim())
    lines.push(wrapLong("job_text", context.jobText.trim(), JOB_TEXT_LIMIT))
  lines.push("", "Questions:")
  for (const question of input.questions) {
    lines.push("", `### ${question.id}`)
    lines.push(`language: ${question.language}`)
    if (question.maxChars) lines.push(`maxChars: ${question.maxChars}`)
    lines.push(wrapUntrusted("question", question.question))
    if (question.options?.length)
      lines.push(
        wrapUntrusted("options", question.options.map((option) => `- ${option}`).join("\n"))
      )
    if (question.similar.length) {
      lines.push("Past answers to similar questions:")
      for (const { row, score } of question.similar) {
        const meta = [
          `similarity ${score.toFixed(2)}`,
          row.company ? `company: ${row.company}` : "",
          row.language ? `language: ${row.language}` : "",
        ]
          .filter(Boolean)
          .join(", ")
        lines.push(`- id: ${row.id} (${meta})`)
        lines.push(`  Q: ${row.question.replace(/\s+/g, " ").slice(0, 400)}`)
        lines.push(`  A: ${row.answer.replace(/\s+/g, " ").slice(0, 1500)}`)
      }
    } else {
      lines.push("Past answers to similar questions: none")
    }
  }
  return lines.join("\n")
}

/** Upper bound for the reply: generous per question, more for long limits. */
export function draftMaxTokens(questions: PendingQuestion[]): number {
  const total = questions.reduce(
    (sum, question) => sum + 300 + Math.ceil((question.maxChars ?? 1200) / 2.5),
    200
  )
  return Math.min(8000, total)
}

/** Final text for one question from the model's reply: fitted to the limit, or an option verbatim. */
export function finalizeDraft(
  question: Pick<PendingQuestion, "maxChars" | "options" | "similar">,
  reply: { text?: string; basedOn?: string[] } | undefined
): { text: string; basedOn: string[] } {
  const raw = (reply?.text ?? "").replace(/^["„”]+|["„”]+$/g, "").trim()
  const allowed = new Set(question.similar.map((item) => item.row.id))
  const basedOn = [...new Set((reply?.basedOn ?? []).filter((id) => allowed.has(id)))]
  if (question.options?.length) return { text: matchOption(raw, question.options) ?? "", basedOn }
  return { text: fitToLimit(raw, question.maxChars), basedOn }
}
