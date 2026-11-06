import { z } from "zod"
import type { CvLocale } from "./blank"
import { textToInline } from "./sanitize"
import { cvId, type CvContent, type CvLetterSection } from "./schema"

/**
 * A cover letter as a document: the CV's header and look, and one "letter" section. The model
 * writes only the paragraphs; the date, addressee, greeting and signature come from known facts.
 * A general letter is written for no offer: it has no addressee or subject, and the letters for
 * offers start from it.
 */

export const LetterReply = z.object({
  paragraphs: z.array(z.string().max(4000)).min(1).max(8),
})
export type LetterReply = z.infer<typeof LetterReply>

const WORDS: Record<
  CvLocale,
  { name: string; team: string; re: string; greeting: string; closing: string; file: string }
> = {
  pl: {
    name: "List motywacyjny",
    team: "zespół rekrutacji",
    re: "Dotyczy",
    greeting: "Szanowni Państwo,",
    closing: "Z poważaniem,",
    file: "List_motywacyjny",
  },
  en: {
    name: "Cover letter",
    team: "Hiring Team",
    re: "Re",
    greeting: "Dear Hiring Team,",
    closing: "Kind regards,",
    file: "Cover_Letter",
  },
}

/** "List motywacyjny", "Cover letter": a letter's name in its language. */
export function letterName(language: CvLocale): string {
  return WORDS[language].name
}

/** The PDF name's last part: cvPdfFileName(name, letterFileSuffix("pl")). */
export function letterFileSuffix(language: CvLocale): string {
  return WORDS[language].file
}

/** "Warszawa, 30 października 2026"; the date alone when the CV gives no place. */
export function letterDate(language: CvLocale, location: string, now = new Date()): string {
  const date = new Intl.DateTimeFormat(language === "pl" ? "pl-PL" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now)
  const place = location.split(/[,·|]/)[0].trim()
  return place ? `${place}, ${date}` : date
}

/** How the person greets and signs off, carried over from their general letter. */
export type LetterFrame = Pick<CvLetterSection, "greeting" | "closing" | "signature">

export function buildLetter(input: {
  cv: CvContent
  language: CvLocale
  /** The offer's company and role; a general letter has neither */
  company?: string
  jobTitle?: string
  paragraphs: string[]
  /** The person's own greeting and sign-off, in the letter's language */
  frame?: LetterFrame | null
  now?: Date
}): CvContent {
  const { cv, language, company, jobTitle, frame } = input
  const words = WORDS[language]
  return {
    ...cv,
    // a letter carries no photo or consent clause: those belong to the CV sent next to it
    header: { ...cv.header, photo: null },
    consent: null,
    sections: [
      {
        id: cvId("s"),
        type: "letter",
        title: words.name,
        date: letterDate(language, cv.header.location, input.now),
        recipient: company ? `${company}, ${words.team}` : "",
        subject: jobTitle ? `${words.re}: ${jobTitle}` : "",
        greeting: frame?.greeting.trim() || words.greeting,
        paragraphs: input.paragraphs
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph) => textToInline(paragraph)),
        closing: frame?.closing.trim() || words.closing,
        signature: frame?.signature.trim() || cv.header.name.trim(),
      },
    ],
  }
}

// ---------------------------------------------------------------- a pasted letter

/** The parts of a letter found in pasted text; empty when the text has none. */
export type LetterParts = {
  recipient: string
  subject: string
  greeting: string
  paragraphs: string[]
  closing: string
  signature: string
}

const GREETING =
  /^(szanown|drodz|drog[aiy]\b|dzień dobry|witam|dear\b|hello\b|hi\b|good (morning|afternoon)|to whom)/i
const CLOSING =
  /^(z poważaniem|z wyrazami|z pozdrowieniami|łączę|pozdrawiam|serdecznie pozdrawiam|kind regards|best regards|warm regards|regards|sincerely|yours (sincerely|faithfully|truly)|best wishes|best,|thank you,|many thanks)/i
const SUBJECT = /^(dotyczy|dot\.|temat|re|subject)\s*:/i
/** "Warszawa, 30 października 2026", "30.10.2026", "October 30, 2026" */
const DATE_LINE =
  /^[\p{L} .-]{0,40},?\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}\s+\p{L}+\s+\d{4}|\p{L}+\s+\d{1,2},?\s+\d{4})\s*(r\.)?$/u
/** Longer than this, a line is a sentence, not a greeting or a sign-off. */
const SHORT_LINE = 80
/** The greeting is looked for this far down; past it a short line is part of the letter. */
const GREETING_WITHIN = 4
const MAX_PARAGRAPHS = 20
/** Characters of one pasted paragraph kept: a letter's paragraph is a few hundred. */
const PARAGRAPH_CHARS = 3000

const isShort = (line: string) => line.length <= SHORT_LINE

/**
 * Finds the greeting, paragraphs and sign-off in a letter the person pasted. Paragraphs are split
 * at blank lines (lines inside one are joined, as a PDF breaks them); text without blank lines
 * has a paragraph per line. Lines above the greeting give the subject and addressee; a date there
 * is left out, as the letter takes today's.
 */
export function splitLetterText(text: string): LetterParts {
  const lines = (block: string) =>
    block
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
  const blocks = text
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map(lines)
    .filter((block) => block.length)
  let chunks = blocks.length === 1 ? blocks[0].map((line) => [line]) : blocks

  const parts: LetterParts = {
    recipient: "",
    subject: "",
    greeting: "",
    paragraphs: [],
    closing: "",
    signature: "",
  }

  // the greeting: the first short line that reads as one, or a short first line ending in a comma
  let at = chunks
    .slice(0, GREETING_WITHIN)
    .findIndex((chunk) => isShort(chunk[0]) && GREETING.test(chunk[0]))
  if (at < 0 && chunks.length > 1 && chunks[0].length === 1 && /,$/.test(chunks[0][0]))
    at = isShort(chunks[0][0]) ? 0 : -1
  if (at >= 0) {
    const head = chunks.slice(0, at).flat()
    const to: string[] = []
    for (const line of head) {
      if (!parts.subject && SUBJECT.test(line)) parts.subject = line
      else if (!DATE_LINE.test(line)) to.push(line)
    }
    parts.recipient = to.join(", ")
    const [greeting, ...rest] = chunks[at]
    parts.greeting = greeting
    chunks = [...(rest.length ? [rest] : []), ...chunks.slice(at + 1)]
  }

  // the sign-off: a closing line in the last chunks, the lines after it the signature
  for (let index = chunks.length - 1; index >= Math.max(0, chunks.length - 3); index -= 1) {
    const line = chunks[index].findIndex((one) => isShort(one) && CLOSING.test(one))
    if (line < 0) continue
    parts.closing = chunks[index][line]
    parts.signature = [...chunks[index].slice(line + 1), ...chunks.slice(index + 1).flat()].join(
      ", "
    )
    const before = chunks[index].slice(0, line)
    chunks = [...chunks.slice(0, index), ...(before.length ? [before] : [])]
    break
  }

  const paragraphs = chunks.map((chunk) => chunk.join(" "))
  // what is past the limit joins the last paragraph rather than being dropped
  parts.paragraphs =
    paragraphs.length > MAX_PARAGRAPHS
      ? [
          ...paragraphs.slice(0, MAX_PARAGRAPHS - 1),
          paragraphs.slice(MAX_PARAGRAPHS - 1).join("\n\n"),
        ]
      : paragraphs
  return parts
}

/** A general letter from text the person pasted, in the CV's header and look. */
export function letterFromText(input: {
  cv: CvContent
  language: CvLocale
  text: string
  now?: Date
}): CvContent {
  const parts = splitLetterText(input.text)
  const content = buildLetter({
    cv: input.cv,
    language: input.language,
    paragraphs: parts.paragraphs.map((paragraph) => paragraph.slice(0, PARAGRAPH_CHARS)),
    frame: parts,
    now: input.now,
  })
  const [section] = content.sections as [CvLetterSection]
  return {
    ...content,
    sections: [
      {
        ...section,
        recipient: parts.recipient.slice(0, 400),
        subject: parts.subject.slice(0, 300),
        greeting: section.greeting.slice(0, 300),
        closing: section.closing.slice(0, 200),
        signature: section.signature.slice(0, 200),
      },
    ],
  }
}
