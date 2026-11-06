import db from "db"
import { inlineToText } from "@newrole/cv-core/sanitize"
import { letterSection, parseCvContent } from "@newrole/cv-core/schema"
import type { PastLetter } from "@newrole/cv-engine/tailor"
import { normalizeText } from "src/server/answers/similarity"
import { classifyField } from "src/server/autofill/fields"

/**
 * The person's last cover letters, which a new letter is written after (writeCoverLetter): the
 * letters kept here and the ones sent in application forms, which the answer bank keeps.
 */

export const RECENT_LETTERS = 3
/** Shorter than this, an answer under "Cover letter" is a note such as "See my CV", not a letter. */
const MIN_LETTER_CHARS = 200
/** Stored answers read to find the letters among them; a bank is hundreds of rows. */
const BANK_SCAN = 500

export type DatedLetter = PastLetter & { at: Date }

/** "Cover letter", "List motywacyjny", "Message to the hiring manager", as autofill reads a field. */
export function isCoverLetterQuestion(question: string): boolean {
  return classifyField({ key: "q", label: question, type: "textarea" }) === "coverLetter"
}

function words(text: string): Set<string> {
  return new Set(
    normalizeText(text)
      .split(" ")
      .filter((word) => word.length > 2)
  )
}

/** One letter twice: written here, then sent in a form with a greeting and a name around it. */
export function sameLetter(a: string, b: string): boolean {
  const left = words(a)
  const right = words(b)
  const smaller = Math.min(left.size, right.size)
  if (!smaller) return false
  let shared = 0
  for (const word of left) if (right.has(word)) shared += 1
  return shared / smaller >= 0.8
}

/** The newest letters, each once, without notes too short to be a letter. */
export function pickRecentLetters(letters: DatedLetter[], limit = RECENT_LETTERS): PastLetter[] {
  const kept: DatedLetter[] = []
  for (const letter of [...letters].sort((a, b) => b.at.getTime() - a.at.getTime())) {
    if (letter.text.trim().length < MIN_LETTER_CHARS) continue
    if (kept.some((other) => sameLetter(other.text, letter.text))) continue
    kept.push(letter)
    if (kept.length >= limit) break
  }
  return kept.map(({ company, title, text }) => ({ company, title, text: text.trim() }))
}

/**
 * The last three letters, newest first. `exceptJobId` leaves out the letter of the offer being
 * written for, so another take does not lean on the one it replaces; `exceptId` the general
 * letter the new one is made from, which the model gets on its own.
 */
export async function recentLetters(
  userId: number,
  opts: { exceptJobId?: string | null; exceptId?: string | null } = {}
): Promise<PastLetter[]> {
  const [documents, answers] = await Promise.all([
    db.cvDocument.findMany({
      where: {
        userId,
        docType: "LETTER",
        kind: "EDITABLE",
        ...(opts.exceptId ? { id: { not: opts.exceptId } } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        jobId: true,
        content: true,
        targetCompany: true,
        targetTitle: true,
        updatedAt: true,
      },
    }),
    db.answer.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: BANK_SCAN,
      select: { question: true, answer: true, company: true, jobTitle: true, updatedAt: true },
    }),
  ])
  const letters: DatedLetter[] = []
  for (const row of documents) {
    if (opts.exceptJobId && row.jobId === opts.exceptJobId) continue
    const content = parseCvContent(row.content)
    const section = content ? letterSection(content) : undefined
    if (!section) continue
    const text = section.paragraphs
      .map((paragraph) => inlineToText(paragraph).trim())
      .filter(Boolean)
      .join("\n\n")
    letters.push({ company: row.targetCompany, title: row.targetTitle, text, at: row.updatedAt })
  }
  for (const row of answers) {
    if (!isCoverLetterQuestion(row.question)) continue
    // sending the same letter again counts it again, which updates the row
    letters.push({ company: row.company, title: row.jobTitle, text: row.answer, at: row.updatedAt })
  }
  return pickRecentLetters(letters)
}
