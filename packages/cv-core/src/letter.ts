import { z } from "zod"
import type { CvLocale } from "./blank"
import { textToInline } from "./sanitize"
import { cvId, type CvContent } from "./schema"

/**
 * A cover letter as a document: the CV's header and look, and one "letter" section. The model
 * writes only the paragraphs; the date, addressee, greeting and signature come from known facts.
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

export function buildLetter(input: {
  cv: CvContent
  language: CvLocale
  company: string
  jobTitle: string
  paragraphs: string[]
  now?: Date
}): CvContent {
  const { cv, language, company, jobTitle } = input
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
        recipient: `${company}, ${words.team}`,
        subject: `${words.re}: ${jobTitle}`,
        greeting: words.greeting,
        paragraphs: input.paragraphs
          .map((paragraph) => paragraph.trim())
          .filter(Boolean)
          .map((paragraph) => textToInline(paragraph)),
        closing: words.closing,
        signature: cv.header.name.trim(),
      },
    ],
  }
}
