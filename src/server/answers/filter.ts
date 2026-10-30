import { fold } from "matching/text"
import { normalizeText, questionKey } from "./similarity"

/** Limits and cleanup shared by the service, the RPC schemas and the MCP tools. */

export const MAX_QUESTION_LENGTH = 2000
export const MAX_ANSWER_LENGTH = 20_000
export const MAX_TAGS = 12
export const MAX_TAG_LENGTH = 40

/** Trimmed, single-spaced tags, at most 40 characters each, deduped ignoring case and accents. */
export function cleanTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const tag = item.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_LENGTH).trim()
    const key = fold(tag)
    if (!tag || seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Question or answer text as stored: unified line endings, no trailing spaces, capped. */
export function cleanText(value: string, max: number): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
    .trim()
}

/** Comparison form of an answer: two answers are "the same" when this matches. */
export function normalizeAnswer(answer: string): string {
  return normalizeText(answer)
}

/* ------------------------------------------------------------- text search */

/** Search terms: folded words; each must start a word somewhere in the row. */
export function queryTerms(q: string | null | undefined): string[] {
  return [
    ...new Set(
      normalizeText(q ?? "")
        .split(" ")
        .filter(Boolean)
    ),
  ].slice(0, 12)
}

/**
 * Full-text-ish match over question, answer, company, job title and tags: every term has to
 * start a word ("kotl" finds "Kotlin", "doswiadcz" finds "doświadczenie"). Returns 0 for no
 * match, 2 when every term is in the question itself, else 1 (used to rank question hits first).
 */
export function queryMatch(
  row: {
    question: string
    answer: string
    company?: string | null
    jobTitle?: string | null
    tags?: string[]
  },
  terms: string[]
): 0 | 1 | 2 {
  if (!terms.length) return 1
  const question = ` ${normalizeText(row.question)}`
  const rest = ` ${normalizeText(
    [row.answer, row.company ?? "", row.jobTitle ?? "", ...(row.tags ?? [])].join(" ")
  )}`
  let inQuestion = true
  for (const term of terms) {
    const q = question.includes(` ${term}`)
    if (!q && !rest.includes(` ${term}`)) return 0
    if (!q) inQuestion = false
  }
  return inQuestion ? 2 : 1
}

/* ----------------------------------------------------------- form answers */

export type SkipReason =
  | "empty"
  | "too-short"
  | "personal-question"
  | "consent"
  | "eeo"
  | "contact"
  | "url"
  | "file"
  | "checkbox"
  | "personal-value"
  | "duplicate"

const EEO =
  /\b(gender|sex|race|racial|ethnic\w*|ethnicity|hispanic|latin[oax]|veteran\w*|disabilit\w*|disabled|pronouns?|sexual orientation|transgender|lgbt\w*|plec|niepelnospraw\w*|narodowosc\w*|pochodzeni\w*|wyznani\w*|religi\w*)\b/

const CONSENT =
  /\b(consent\w*|agree|agrees|acknowledg\w*|privacy|gdpr|rodo|zgod\w*|wyrazam|akceptuj\w*|terms (and conditions|of (service|use))|regulamin\w*|polityk\w* prywatnosci|przetwarzani\w*|data processing|certify|oswiadczam|potwierdzam|confirm\w*|newsletter)\b/

const IDENTITY =
  /\b(first|last|full|given|family|middle|preferred|legal|nick) ?names?\b|\bsurnames?\b|^(your )?names?\b|\bimie\b|\bimiona\b|\bnazwisko\b|\be ?mail\b|\bphone\b|\bmobile\b|\btelephone\b|\btelefon\w*\b|\bcell ?phone\b|\bwhatsapp\b|\bskype\b|\bpesel\b|\bnip\b|\bpassport\b|\bpaszport\w*\b|\bid number\b|\bnational id\b|\bsocial security\b|\bssn\b|\bdate of birth\b|\bbirth ?date\b|\bbirthday\b|\bdata urodzenia\b|\burodzeni\w*\b|\bpassword\b|\bhaslo\b|\bhome address\b|\bstreet\b|\bpostal\b|\bpost ?code\b|\bzip( code)?\b|\bkod pocztowy\b|\badres zamieszkania\b|\bulica\b/

/** Only for short field labels ("City", "LinkedIn profile"); long questions may mention these. */
const SHORT_FIELD =
  /\b(address|adres|city|town|miasto|miejscowosc|country|kraj|location|lokalizacja|linkedin|github|gitlab|website|web site|portfolio|strona( www| internetowa)?|url|link|twitter|x com|resume|cv|curriculum vitae|photo|zdjecie|avatar|age|wiek)\b/

const SALARY =
  /\b(salary|salar\w*|compensation|remuneration|pay|rate|wage|wynagrodz\w*|zarob\w*|stawk\w*|pensj\w*|finansow\w*)\b/

const EMAIL = /[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/i
const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/
const URL_ONLY =
  /^(?:https?:\/\/|www\.)\S+$|^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|pl|io|dev|me|net|org|eu|app|co|it)(?:\/\S*)?$/i
const FILE_NAME = /(?:^|[\\/])[^\\/]*\.(?:pdf|docx?|odt|rtf|txt|pages|png|jpe?g|heic|zip)$/i
const CHECKBOX = /^(on|off|true|false|checked|unchecked|selected|null|undefined)$/i

function digitsOf(value: string): string {
  return value.replace(/\D/g, "")
}

function looksLikePhone(value: string): boolean {
  const trimmed = value.trim()
  if (!/^[+()\d\s./-]+$/.test(trimmed)) return false
  const digits = digitsOf(trimmed).length
  return digits >= 9 && digits <= 15
}

/** Email addresses and phone numbers inside a longer answer become placeholders. */
export function redactContacts(text: string): string {
  return text
    .replace(new RegExp(EMAIL.source, "gi"), "[e-mail]")
    .replace(new RegExp(PHONE.source, "g"), (match) =>
      digitsOf(match).length >= 9 && digitsOf(match).length <= 15 ? "[telefon]" : match
    )
}

/**
 * The person's own contact data (name, email, phone, profile links) in comparison form,
 * so an answer that is just one of these is never stored.
 */
export function personalValues(input: {
  name?: string | null
  email?: string | null
  applicant?: Record<string, string | undefined> | null
}): string[] {
  const applicant = input.applicant ?? {}
  const raw = [
    input.name,
    input.email,
    applicant.firstName,
    applicant.lastName,
    applicant.firstName && applicant.lastName
      ? `${applicant.firstName} ${applicant.lastName}`
      : null,
    applicant.email,
    applicant.phone,
    applicant.linkedinUrl,
    applicant.githubUrl,
    applicant.websiteUrl,
  ]
  const out = new Set<string>()
  for (const value of raw) {
    if (!value) continue
    const normal = normalizeText(value)
    if (normal.length >= 2) out.add(normal)
    const digits = digitsOf(value)
    if (digits.length >= 9 && /^[+()\d\s./-]+$/.test(value.trim())) out.add(digits)
  }
  return [...out]
}

export type PairVerdict = { keep: true; answer: string } | { keep: false; reason: SkipReason }

/**
 * Whether a submitted form answer belongs in the answer bank. Skips contact and identity data,
 * consent and EEO questions, links, file names and checkbox values; keeps open answers and
 * salary expectations (useful next time). A kept answer may come back with contacts redacted.
 */
export function formPairVerdict(
  pair: { question: string; answer: string },
  personal: string[] = []
): PairVerdict {
  const answer = cleanText(pair.answer ?? "", MAX_ANSWER_LENGTH)
  const key = questionKey(pair.question ?? "")
  if (!answer || !key) return { keep: false, reason: "empty" }
  if (answer.length < 2) return { keep: false, reason: "too-short" }
  if (EEO.test(key)) return { keep: false, reason: "eeo" }
  if (CONSENT.test(key)) return { keep: false, reason: "consent" }
  if (IDENTITY.test(key)) return { keep: false, reason: "personal-question" }
  const words = key.split(" ").length
  if (words <= 6 && SHORT_FIELD.test(key)) return { keep: false, reason: "personal-question" }
  if (CHECKBOX.test(answer)) return { keep: false, reason: "checkbox" }
  if (URL_ONLY.test(answer)) return { keep: false, reason: "url" }
  if (
    (FILE_NAME.test(answer) && answer.length <= 200 && !answer.includes("\n")) ||
    /fakepath/i.test(answer)
  )
    return { keep: false, reason: "file" }
  const salary = SALARY.test(key)
  if (!salary && looksLikePhone(answer)) return { keep: false, reason: "contact" }
  const normal = normalizeText(answer)
  const digits = digitsOf(answer)
  for (const value of personal) {
    if (normal === value || (digits.length >= 9 && digits === value))
      return { keep: false, reason: "personal-value" }
  }
  const hasContact =
    EMAIL.test(answer) || (!salary && PHONE.test(answer) && redactContacts(answer) !== answer)
  if (hasContact && answer.length < 200) return { keep: false, reason: "contact" }
  return { keep: true, answer: hasContact ? redactContacts(answer) : answer }
}

/** The pairs to store from one submitted form, deduped, with the reason for each skipped one. */
export function selectFormPairs(
  pairs: { question: string; answer: string }[],
  personal: string[] = []
): {
  keep: { question: string; answer: string }[]
  skipped: { question: string; reason: SkipReason }[]
} {
  const keep: { question: string; answer: string }[] = []
  const skipped: { question: string; reason: SkipReason }[] = []
  const seen = new Set<string>()
  for (const pair of pairs) {
    const verdict = formPairVerdict(pair, personal)
    if (!verdict.keep) {
      skipped.push({ question: pair.question, reason: verdict.reason })
      continue
    }
    const id = `${questionKey(pair.question)}\u0000${normalizeAnswer(verdict.answer)}`
    if (seen.has(id)) {
      skipped.push({ question: pair.question, reason: "duplicate" })
      continue
    }
    seen.add(id)
    keep.push({ question: cleanText(pair.question, MAX_QUESTION_LENGTH), answer: verdict.answer })
  }
  return { keep, skipped }
}
