import { recordFormAnswers } from "src/server/answers/service"
import {
  addApplicationNote,
  createApplication,
  findApplicationByUrl,
} from "src/server/applications/service"
import { classifyField, FIELD_KINDS, type FieldKind } from "./fields"
import { extractJob, normalizePostingUrl, type PageInput } from "./job-extract"

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
 * keeps it only when both its own reading and the extension's agree that it is a question,
 * and the value does not look like an e-mail, a phone number, a card or a PESEL.
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
    if (!kinds.some((kind) => BANK_KINDS.includes(kind))) continue
    if (EMAIL_VALUE.test(answer) || PHONE_VALUE.test(answer) || CARD_OR_ID.test(answer)) continue
    const key = question.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ question: question.slice(0, 500), answer: answer.slice(0, 10_000) })
  }
  return out
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
      company: given?.company?.trim() || extracted?.company || hostLabel(page.url),
      title:
        given?.title?.trim() || extracted?.title || page.title?.trim().slice(0, 200) || "Aplikacja",
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

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return "Nieznana firma"
  }
}
