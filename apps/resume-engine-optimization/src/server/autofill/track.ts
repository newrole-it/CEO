import { formPairVerdict } from "src/server/answers/filter"
import { formPrivacy, recordFormAnswers } from "src/server/answers/service"
import { answerKey } from "src/server/applications/logic"
import {
  addApplicationNote,
  createApplication,
  findApplicationByUrl,
  saveFormAnswers,
} from "src/server/applications/service"
import type { FormAnswer } from "src/server/applications/types"
import { classifyField, FIELD_KINDS, QUESTION_KINDS, type FieldKind } from "./fields"
import { cleanTitle, extractJob, normalizePostingUrl, type PageInput } from "./job-extract"

/** POST /api/ext/submitted (docs/product/plan-aplikacje.md §5.3, E5.3). */

export type SubmittedField = {
  label: string
  value: string
  kind?: string | null
  type?: string | null
}

export type TrackResult = {
  application: { id: string; company: string; title: string; status: string }
  created: boolean
  answers: { saved: number; reused: number }
}

export const RESENT_NOTE = "Wysłano ponownie przez rozszerzenie"

/** Better than the host: "linkedin.com" would read as the employer, here and in later matching. */
export const UNKNOWN_COMPANY = "Nieznana firma"

/** Kinds whose answers go to the answer bank. Contact details, EEO, consents and secrets never do. */
const BANK_KINDS: readonly FieldKind[] = [
  "openQuestion",
  "choiceQuestion",
  "coverLetter",
  "howHeard",
]

const EMAIL_VALUE = /[^\s@]+@[^\s@]+\.[^\s@]+/
const PHONE_VALUE = /^\+?[\d\s().-]{7,20}$/
const CARD_OR_ID = /\b\d{11}\b|\b(?:\d[ -]?){13,19}\b/

function asKind(value: string | null | undefined): FieldKind | null {
  return value && (FIELD_KINDS as readonly string[]).includes(value) ? (value as FieldKind) : null
}

/**
 * Question/answer pairs safe for the answer bank. The server classifies every field again and
 * keeps it only when neither its own reading nor the extension's says it is anything but a
 * question, such as a short "Tech stack" nobody could name, and the value does not look like an
 * e-mail, a phone number, a card or a PESEL.
 */
export function answerPairs(fields: SubmittedField[]): { question: string; answer: string }[] {
  const out: { question: string; answer: string }[] = []
  const seen = new Set<string>()
  for (const field of fields) {
    const question = field.label?.replace(/\s+/g, " ").trim()
    const answer = field.value?.trim()
    if (!question || !answer) continue
    const type =
      field.type?.trim() || (answer.length > 120 || answer.includes("\n") ? "textarea" : "text")
    const ours = classifyField({
      key: question,
      label: question,
      type,
      options: type === "select" ? [answer, "-"] : undefined,
    })
    const theirs = asKind(field.kind)
    const kinds = [ours, theirs].filter(Boolean) as FieldKind[]
    if (!kinds.every((kind) => BANK_KINDS.includes(kind) || kind === "other")) continue
    if (EMAIL_VALUE.test(answer) || PHONE_VALUE.test(answer) || CARD_OR_ID.test(answer)) continue
    if (!formPairVerdict({ question, answer }).keep) continue
    const key = question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ question: question.slice(0, 500), answer: answer.slice(0, 10_000) })
  }
  return out
}

/** Questions about the work. "other" is a short field nobody could name, such as "Tech stack". */
const JOB_KINDS: readonly FieldKind[] = [...QUESTION_KINDS, "other"]

/** Digits and dashes here are amounts and dates, not phone numbers or IDs. */
const NUMERIC_KINDS: readonly FieldKind[] = ["salary", "noticePeriod", "availableFrom"]

const CHOICE_TYPES = new Set(["select", "radio", "checkbox"])

/** Below this an answer is a value that may be a phone or an ID; above it, prose as written. */
const LONG_ANSWER = 200

export type FormPrivacy = { personal: string[]; names: string[] }

/** The answer as it may be kept, or null when it is personal data. */
function jobAnswer(
  question: string,
  answer: string,
  kind: FieldKind,
  { personal, names }: FormPrivacy
): string | null {
  if (NUMERIC_KINDS.includes(kind)) return EMAIL_VALUE.test(answer) ? null : answer
  // "Years of experience: 8" is too short to reuse from the bank, but it is an answer.
  if (/^\d$/.test(answer)) return answer
  if (answer.length < LONG_ANSWER && CARD_OR_ID.test(answer)) return null
  const verdict = formPairVerdict({ question, answer }, personal, names)
  return verdict.keep ? verdict.answer : null
}

/**
 * The form as the application keeps it: the answers about the work, so the person can come back
 * to what they told whom. No personal data: the server reads each field again, so an extension
 * that calls an e-mail field a question cannot get it stored, and contacts or the person's name
 * inside a longer answer are replaced.
 */
export function formAnswers(
  fields: SubmittedField[],
  privacy: FormPrivacy = { personal: [], names: [] }
): FormAnswer[] {
  const out = new Map<string, FormAnswer>()
  for (const field of fields) {
    const question = field.label?.replace(/\s+/g, " ").trim()
    const answer = field.value?.trim()
    if (!question || !answer) continue
    const type =
      field.type?.trim() || (answer.length > 120 || answer.includes("\n") ? "textarea" : "text")
    const ours = classifyField({
      key: question,
      label: question,
      type,
      options: CHOICE_TYPES.has(type) ? [answer, "-"] : undefined,
    })
    const theirs = asKind(field.kind)
    const kinds = [ours, theirs].filter(Boolean) as FieldKind[]
    if (!kinds.every((item) => JOB_KINDS.includes(item))) continue
    const kind = kinds.includes("salary") ? "salary" : (theirs ?? ours)
    const value = jobAnswer(question, answer, kind, privacy)
    if (!value) continue
    const key = answerKey(question)
    const same = out.get(key)
    // One label several times, such as "Employer" per job: all of them are answers.
    if (same) {
      if (!same.answer.split("\n").includes(value)) same.answer += `\n${value}`
    } else out.set(key, { question: question.slice(0, 500), answer: value.slice(0, 10_000), kind })
  }
  return [...out.values()]
}

export async function trackSubmission(input: {
  userId: number
  page: PageInput & { title: string; text: string }
  job?: { company?: string | null; title?: string | null } | null
  fields: SubmittedField[]
}): Promise<TrackResult> {
  const { userId } = input
  const page = { ...input.page, url: normalizePostingUrl(input.page.url) }
  const existing = await findApplicationByUrl(userId, page.url)

  let application: { id: string; company: string; title: string; status: string }
  let created = false
  if (existing) {
    application = existing
    if (existing.status === "APPLIED") {
      application = await addApplicationNote(userId, existing.id, RESENT_NOTE, "extension")
    }
  } else {
    const given = input.job?.company?.trim() && input.job?.title?.trim() ? input.job : null
    const extracted = given ? null : await extractJob({ ...page, userId })
    const result = await createApplication({
      userId,
      url: page.url,
      company: given?.company?.trim() || extracted?.company || UNKNOWN_COMPANY,
      title:
        given?.title?.trim() ||
        extracted?.title ||
        cleanTitle(page.title ?? "").slice(0, 200) ||
        "Aplikacja",
      location: extracted?.location ?? null,
      source: "extension",
      channel: "extension",
    })
    application = result.application
    created = result.created
    if (!created && result.application.status === "APPLIED") {
      // The URL matched an application through the index (same offer, other link).
      application = await addApplicationNote(
        userId,
        result.application.id,
        RESENT_NOTE,
        "extension"
      )
    }
  }

  if (input.fields.length) {
    const form = formAnswers(input.fields, await formPrivacy(userId))
    await saveFormAnswers(userId, application.id, form, "extension")
  }

  const pairs = answerPairs(input.fields)
  const answers = pairs.length
    ? await recordFormAnswers({
        userId,
        applicationId: application.id,
        company: application.company,
        jobTitle: application.title,
        sourceUrl: page.url,
        pairs,
      })
    : { saved: 0, reused: 0 }

  return {
    application: {
      id: application.id,
      company: application.company,
      title: application.title,
      status: application.status,
    },
    created,
    answers: { saved: answers.saved, reused: answers.reused },
  }
}
