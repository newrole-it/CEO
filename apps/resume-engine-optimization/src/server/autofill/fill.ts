import { draftAnswers } from "src/server/answers/service"
import type { DraftResult } from "src/server/answers/types"
import { findApplicationByUrl, findJobByUrl } from "src/server/applications/service"
import { defaultCv, tailoredCv } from "src/server/cv/service"
import { getApplicant } from "src/server/profile/applicant"
import { classifyField, isNeverFill, type FieldKind, type FormField } from "./fields"
import {
  extractJobByModel,
  extractJobByRules,
  extractJobFromIndex,
  finishJob,
  mergeFacts,
  needsModel,
  normalizePostingUrl,
  type ExtractedJob,
} from "./job-extract"
import { startFormLetter } from "./letter"
import { pickOption, profileValue, realOptions } from "./values"

/** POST /api/ext/fill (docs/product/plan-aplikacje.md §5.3). */

/** letter: the cover letter, written apart (./letter.ts) and fetched by its id in `letter`. */
export type FillSource = "profile" | "answers" | "ai" | "cv" | "letter" | "skip"

export type FillValue = {
  key: string
  value: string
  kind: FieldKind
  source: FillSource
  answerId?: string
  /** source cv: the CV to attach, the one written for this offer when there is one */
  documentId?: string
}

export type PageInfo = {
  url: string
  title: string
  text: string
  siteName?: string | null
  company?: string | null
  role?: string | null
}

export type AppliedInfo = { id: string; status: string; appliedAt: Date }

export type FillResult = {
  values: FillValue[]
  job: { company: string; title: string } | null
  applied: AppliedInfo | null
  /** The cover letter being written for this form's letter fields (GET /api/ext/letter?id=) */
  letter: { id: string } | null
}

/** Questions sent to the model in one batch; the rest stay empty. */
export const MAX_DRAFTED_QUESTIONS = 25

/** Kinds answered from the answer bank or a draft, when the profile has no value for them. */
const DRAFTED_KINDS: readonly FieldKind[] = [
  "openQuestion",
  "choiceQuestion",
  "coverLetter",
  "howHeard",
  "salary",
  "noticePeriod",
  "availableFrom",
  "workAuthorization",
  "relocation",
]

export type FillPlan = {
  values: Map<string, FillValue>
  questions: {
    key: string
    question: string
    maxChars?: number
    options?: string[]
    kind: FieldKind
  }[]
  /** The form has a place for a cover letter; maxChars is the smallest limit among them */
  letter: { maxChars?: number } | null
}

/** Where a whole letter goes: a text box or a file. A select about the letter is a question. */
const LETTER_TYPES = new Set(["textarea", "contenteditable", "file"])

/**
 * The deterministic part: profile values, the CV, skips, the letter fields, and the questions
 * left for drafting. Pure, so it can be tested without a database.
 */
export function planFill(
  fields: FormField[],
  applicant: Parameters<typeof profileValue>[2],
  cv: { id: string; title: string } | null
): FillPlan {
  const values = new Map<string, FillValue>()
  const questions: FillPlan["questions"] = []
  const limits: number[] = []
  let letter = false
  const skip = (field: FormField, kind: FieldKind) =>
    values.set(field.key, { key: field.key, value: "", kind, source: "skip" })

  for (const field of fields) {
    const kind = classifyField(field)
    if (isNeverFill(kind) || kind === "other") {
      skip(field, kind)
      continue
    }
    const type = (field.type || "text").toLowerCase()
    if (kind === "resume") {
      if (type === "file" && cv)
        values.set(field.key, {
          key: field.key,
          value: cv.title,
          kind,
          source: "cv",
          documentId: cv.id,
        })
      else skip(field, kind)
      continue
    }
    if (kind === "coverLetter" && LETTER_TYPES.has(type)) {
      letter = true
      if (type !== "file" && field.maxLength && field.maxLength > 0) limits.push(field.maxLength)
      values.set(field.key, { key: field.key, value: "", kind, source: "letter" })
      continue
    }
    if (type === "file") {
      skip(field, kind)
      continue
    }
    const fromProfile = profileValue(field, kind, applicant)
    if (fromProfile) {
      values.set(field.key, { key: field.key, value: fromProfile, kind, source: "profile" })
      continue
    }
    if (DRAFTED_KINDS.includes(kind) && field.label.trim()) {
      const options = realOptions(field.options)
      questions.push({
        key: field.key,
        question: field.label.trim().slice(0, 500),
        maxChars: field.maxLength && field.maxLength > 0 ? field.maxLength : undefined,
        options: options.length ? options.slice(0, 60) : undefined,
        kind,
      })
      continue
    }
    skip(field, kind)
  }
  return {
    values,
    questions: questions.slice(0, MAX_DRAFTED_QUESTIONS),
    letter: letter ? (limits.length ? { maxChars: Math.min(...limits) } : {}) : null,
  }
}

/** The CV written for this posting when there is one, else the default. */
async function cvForFill(
  userId: number,
  url: string
): Promise<{ id: string; title: string } | null> {
  try {
    const job = await findJobByUrl(url)
    const tailored = job ? await tailoredCv(userId, job.id) : null
    if (tailored) return tailored
    const cv = await defaultCv(userId)
    return cv ? { id: cv.id, title: cv.title } : null
  } catch (error) {
    console.error("fill: default CV failed", error instanceof Error ? error.message : error)
    return null
  }
}

export async function fillForm(input: {
  userId: number
  page: PageInfo
  fields: FormField[]
}): Promise<FillResult> {
  const { userId, fields } = input
  const page = { ...input.page, url: normalizePostingUrl(input.page.url) }
  const [applicant, cv, applied, indexed] = await Promise.all([
    getApplicant(userId),
    cvForFill(userId, page.url),
    findApplicationByUrl(userId, page.url).catch(() => null),
    extractJobFromIndex(page.url).catch(() => null),
  ])
  const plan = planFill(fields, applicant.effective, cv)

  // Index and rules first; the model runs next to the drafts, only when they miss.
  const rules = extractJobByRules(page)
  const askModel = !indexed && needsModel(page, rules)
  const modelJob = askModel ? extractJobByModel(page) : Promise.resolve(null)
  const jobFacts: Promise<ExtractedJob | null> = modelJob.then(
    (model) => indexed ?? finishJob(page, mergeFacts(rules, model)),
    () => indexed ?? finishJob(page, rules)
  )
  // Started now and fetched later: writing a letter outlasts what Chrome waits for a response.
  const letter = plan.letter
    ? { id: startFormLetter({ userId, page, maxChars: plan.letter.maxChars, job: jobFacts }) }
    : null
  const noDrafts: Record<string, DraftResult> = {}
  const [drafts, job] = await Promise.all([
    plan.questions.length
      ? draftAnswers({
          userId,
          questions: plan.questions.map(({ key, question, maxChars, options }) => ({
            key,
            question,
            maxChars,
            options,
          })),
          context: {
            // No guess from the window title here: a draft would praise "Warsaw" as the employer.
            company: indexed?.company ?? rules.company,
            jobTitle: indexed?.title ?? rules.title,
            jobText: page.text || null,
            url: page.url,
          },
          // No language: each draft follows the language of its question.
        }).catch((error) => {
          console.error("fill: drafts failed", error instanceof Error ? error.message : error)
          return noDrafts
        })
      : Promise.resolve(noDrafts),
    jobFacts,
  ])

  for (const question of plan.questions) {
    const draft = drafts[question.key]
    const text = draft?.text?.trim() ?? ""
    if (!draft || !text || draft.reader === "none") {
      plan.values.set(question.key, {
        key: question.key,
        value: "",
        kind: question.kind,
        source: "skip",
      })
      continue
    }
    const value = question.options ? (pickOption(text, question.options) ?? text) : text
    const source: FillSource = draft.reader === "reuse" ? "answers" : "ai"
    plan.values.set(question.key, {
      key: question.key,
      value: question.maxChars ? value.slice(0, question.maxChars) : value,
      kind: question.kind,
      source,
      ...(source === "answers" && draft.basedOn[0] ? { answerId: draft.basedOn[0] } : {}),
    })
  }

  return {
    // Same order as the fields the extension sent; questions past the draft cap have no entry.
    values: fields.flatMap((field) => {
      const value = plan.values.get(field.key)
      return value ? [value] : []
    }),
    job: job ? { company: job.company, title: job.title } : null,
    applied: applied
      ? { id: applied.id, status: applied.status, appliedAt: applied.appliedAt }
      : null,
    letter,
  }
}
