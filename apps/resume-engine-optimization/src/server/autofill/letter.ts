import { randomBytes } from "crypto"
import type { CvLocale } from "@newrole/cv-core/blank"
import { inlineToText } from "@newrole/cv-core/sanitize"
import { letterSection, type CvContent } from "@newrole/cv-core/schema"
import { OFFER_TEXT_LIMIT } from "@newrole/cv-core/tailor"
import { fitToLimit } from "src/server/answers/draft"
import { findJobByUrl } from "src/server/applications/service"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { recentLetters } from "src/server/cv/letters"
import { contentPdf, cvPdf, CvError } from "src/server/cv/service"
import { generateLetterForJob, letterForJob, writeLetterForPage } from "src/server/cv/tailor"
import { addOfferByLink } from "src/server/offers/service"
import {
  cleanTitle,
  normalizePostingUrl,
  postingUrlCandidates,
  type ExtractedJob,
} from "./job-extract"

/**
 * The cover letter for a form the extension fills (POST /api/ext/fill, GET /api/ext/letter):
 * written for this offer and company from the whole posting, the CV and the person's last three
 * letters (src/server/cv/tailor.ts). Writing it takes longer than Chrome lets an extension wait for
 * a response (30 s), so fill only starts it and the extension asks for it until it is done.
 *
 * A letter in progress lives in the server process that started it, as the app runs on one.
 */

export type FormLetter = {
  /** For the form field: greeting, paragraphs and sign-off, or the paragraphs alone to fit */
  text: string
  /** The letter kept for this offer in newrole.it; null for a page outside the index */
  documentId: string | null
  /** Written just now; false: the letter this offer already had */
  created: boolean
  /** How many of the person's earlier letters it was written after */
  pastLetters: number
}

export type LetterStatus =
  | { status: "pending" }
  | { status: "done"; letter: FormLetter }
  | { status: "failed"; error: string }

export type LetterPage = { url: string; title: string; text: string }

export type LetterInput = {
  userId: number
  page: LetterPage
  /** The smallest limit among the form's letter fields */
  maxChars?: number
  /** What fill read about the posting, for a page outside the index. Never rejects. */
  job: Promise<ExtractedJob | null>
}

export type WrittenLetter = { letter: FormLetter; content: CvContent; language: CvLocale }

/** Room the greeting and the sign-off take around the paragraphs. */
const FRAME_CHARS = 80
const TASK_TTL_MS = 15 * 60_000
const MAX_TASKS = 100

class LetterError extends Error {}

/** The letter as one text for a form field, cut to the field's limit when it has one. */
export function letterText(content: CvContent, maxChars?: number): string {
  const section = letterSection(content)
  if (!section) return ""
  const body = section.paragraphs
    .map((paragraph) => inlineToText(paragraph).trim())
    .filter(Boolean)
    .join("\n\n")
  const signOff = [section.closing, section.signature]
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
  const full = [section.greeting.trim(), body, signOff].filter(Boolean).join("\n\n")
  if (!maxChars || full.length <= maxChars) return full
  return fitToLimit(body, maxChars)
}

/** What the paragraphs may take, so that the whole letter fits a field's limit. */
export function paragraphBudget(maxChars: number | undefined): number | undefined {
  if (!maxChars || maxChars <= 0) return undefined
  return maxChars > 4 * FRAME_CHARS ? maxChars - FRAME_CHARS : maxChars
}

type Posting =
  | { jobId: string }
  | {
      jobId: null
      company: string | null
      title: string | null
      location: string | null
      /** The posting read on the server just now; empty when it was not */
      text: string
      withheld: boolean
    }

/**
 * The offer behind the form: one the index knows, else the posting read and kept for the person as
 * "Dodaj ofertę" does (the ATS's API or the page's JobPosting), else what reading it gave.
 */
async function findPosting(userId: number, url: string): Promise<Posting> {
  for (const candidate of postingUrlCandidates(url)) {
    const job = await findJobByUrl(candidate).catch(() => null)
    if (job) return { jobId: job.id }
  }
  const none: Posting = {
    jobId: null,
    company: null,
    title: null,
    location: null,
    text: "",
    withheld: false,
  }
  try {
    await assertOfferReadLimit(userId)
  } catch {
    // too many links read this hour: the open page's text is still there
    return none
  }
  const check = await addOfferByLink(userId, url).catch((error: unknown) => {
    console.warn(
      "form letter: reading the offer failed",
      error instanceof Error ? error.message : error
    )
    return null
  })
  if (check?.kind === "added") return { jobId: check.jobId }
  if (check?.kind === "draft") {
    return {
      jobId: null,
      company: check.facts?.company ?? null,
      title: check.facts?.title ?? null,
      location: check.facts?.location ?? null,
      text: check.text,
      withheld: check.withheld,
    }
  }
  return none
}

function written(
  content: CvContent,
  language: CvLocale,
  meta: Omit<FormLetter, "text">,
  maxChars: number | undefined
): WrittenLetter {
  const text = letterText(content, maxChars)
  if (!text) throw new CvError("llm-failed", "The letter has no text.")
  return { letter: { text, ...meta }, content, language }
}

/**
 * The letter this offer already has, as the person may have edited it; else a new one, kept as
 * the offer's letter. A posting outside the index gets a letter kept nowhere.
 */
export async function writeFormLetter(input: LetterInput): Promise<WrittenLetter> {
  const { userId, page, maxChars } = input
  const budget = paragraphBudget(maxChars)
  const posting = await findPosting(userId, page.url)

  if (posting.jobId !== null) {
    const existing = await letterForJob(userId, posting.jobId)
    if (existing) {
      const meta = { documentId: existing.id, created: false, pastLetters: 0 }
      return written(existing.content, existing.language, meta, maxChars)
    }
    const pastLetters = await recentLetters(userId, { exceptJobId: posting.jobId })
    const result = await generateLetterForJob({
      userId,
      jobId: posting.jobId,
      pastLetters,
      maxChars: budget,
      pageText: page.text,
    })
    const meta = { documentId: result.id, created: true, pastLetters: pastLetters.length }
    return written(result.content, result.language, meta, maxChars)
  }

  const facts = await input.job
  const company = posting.company ?? facts?.company ?? null
  const title = posting.title ?? facts?.title ?? (cleanTitle(page.title) || null)
  if (!company || !title)
    throw new LetterError(
      "Nie wiem, do jakiej firmy i na jakie stanowisko jest ten formularz, więc nie piszę listu."
    )
  // the server's read of the posting, else the open page; a site that opts out of AI gives neither
  const text = posting.withheld
    ? ""
    : (posting.text.length > page.text.length ? posting.text : page.text).slice(0, OFFER_TEXT_LIMIT)
  const pastLetters = await recentLetters(userId)
  const { content, language } = await writeLetterForPage({
    userId,
    offer: {
      company,
      title,
      location: posting.location ?? facts?.location ?? null,
      text,
      origin: posting.withheld ? "withheld" : text ? "full" : "none",
    },
    pastLetters,
    maxChars: budget,
  })
  const meta = { documentId: null, created: true, pastLetters: pastLetters.length }
  return written(content, language, meta, maxChars)
}

/** What the panel says when no letter came out. */
function failureText(error: unknown): string {
  if (error instanceof LetterError) return error.message
  if (error instanceof CvError) {
    if (error.code === "llm-unavailable")
      return "Model nie jest skonfigurowany, więc nie napiszę listu."
    if (error.code === "no-base" || error.code === "no-content")
      return "Nie masz jeszcze CV ani profilu, z którego mógłbym napisać list."
    if (error.code === "llm-failed") return "Model nie zwrócił listu. Spróbuj ponownie."
  }
  console.error("form letter failed", error instanceof Error ? error.message : error)
  return "Nie udało się napisać listu. Spróbuj ponownie."
}

// ---------------------------------------------------------------- letters in progress

type Task = {
  userId: number
  key: string
  until: number
  state:
    | { status: "pending" }
    | { status: "failed"; error: string }
    | ({ status: "done" } & WrittenLetter)
}

const tasks = new Map<string, Task>()

function prune(now: number) {
  for (const [id, task] of tasks) if (task.until <= now) tasks.delete(id)
  while (tasks.size >= MAX_TASKS) tasks.delete(tasks.keys().next().value as string)
}

/**
 * Starts the letter and returns its id at once. Filling the same form again while the letter is
 * being written, or soon after, gets the same letter instead of a second one.
 */
export function startFormLetter(
  input: LetterInput,
  write: (input: LetterInput) => Promise<WrittenLetter> = writeFormLetter
): string {
  const now = Date.now()
  prune(now)
  const key = [input.userId, normalizePostingUrl(input.page.url), input.maxChars ?? ""].join(" ")
  for (const [id, task] of tasks) {
    if (task.key === key && task.state.status !== "failed") return id
  }
  const id = randomBytes(16).toString("base64url")
  const task: Task = {
    userId: input.userId,
    key,
    until: now + TASK_TTL_MS,
    state: { status: "pending" },
  }
  tasks.set(id, task)
  write(input).then(
    (result) => {
      task.state = { status: "done", ...result }
    },
    (error: unknown) => {
      task.state = { status: "failed", error: failureText(error) }
    }
  )
  return id
}

/** Where the letter is; null for an unknown id or another person's. */
export function formLetterStatus(userId: number, id: string): LetterStatus | null {
  const task = tasks.get(id)
  if (!task || task.userId !== userId) return null
  if (task.state.status === "done") return { status: "done", letter: task.state.letter }
  return task.state
}

/** The finished letter as PDF: the offer's letter as it is now, or one rendered from the text. */
export async function formLetterPdf(
  userId: number,
  id: string
): Promise<{ bytes: Buffer; name: string } | null> {
  const task = tasks.get(id)
  if (!task || task.userId !== userId || task.state.status !== "done") return null
  const { letter, content, language } = task.state
  return letter.documentId
    ? cvPdf(userId, letter.documentId)
    : contentPdf(content, "LETTER", language)
}

/** Tests start from no letters. */
export function clearFormLetters(): void {
  tasks.clear()
}
