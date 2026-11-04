import { Prisma } from "@prisma/client"
import db from "db"
import { tailorCv, writeCoverLetter } from "@newrole/cv-engine/tailor"
import type { LlmClient } from "@newrole/llm/common"
import { cvLocale } from "@newrole/cv-core/blank"
import { detectLanguage } from "@newrole/cv-core/language"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { parseTailorNotes, type OfferTextOrigin, type TailorNotes } from "@newrole/cv-core/tailor"
import {
  indexedOfferText,
  offerSourceSelect,
  readOfferText,
  toOfferSource,
} from "src/server/jobs/offer-text"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import type { HttpClient } from "src/server/security/safe-fetch"
import { createCv, CvError, defaultCv, getCv, type CvDetail, type CvLanguage } from "./service"
import { createEditableFromUpload } from "./structure"
import { appendVersion, keepCurrentState, toStoredJson } from "./versions"

/**
 * A CV and a cover letter written for one offer in the index: @newrole/cv-engine writes them,
 * this module picks the base CV, reads the offer and keeps every generation as a version.
 */

export type TailorJob = {
  id: string
  company: string
  title: string
  location: string | null
  url: string | null
  /** The offer's text for a model; empty when there is none or the site opted out of AI */
  text: string
  origin: OfferTextOrigin
  /** The site opted out of AI use */
  withheld: boolean
  language: CvLanguage
}

export type TailorResult = {
  id: string
  content: CvContent
  language: CvLanguage
  notes: TailorNotes
  /** The document's updatedAt after this write, for the editor's next save */
  updatedAt: Date
}

/** What the editor shows around a tailored document. */
export type TailorContext = {
  job: { id: string | null; company: string; title: string; url: string | null }
  cvId: string | null
  letterId: string | null
  notes: TailorNotes | null
}

/** Reads the index only, unless `live` asks for the whole offer from its source. */
export async function loadTailorJob(
  jobId: string,
  live?: { http?: HttpClient }
): Promise<TailorJob | null> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { ...offerSourceSelect, locationText: true },
  })
  if (!job) return null
  const source = toOfferSource(job)
  const read = live ? await readOfferText(source, live.http) : indexedOfferText(source)
  return {
    id: job.id,
    company: source.company,
    title: job.title,
    location: job.locationText,
    url: job.originalUrl || null,
    text: read.text,
    origin: read.origin,
    withheld: read.origin === "withheld",
    // read here, not sent anywhere: an opted-out offer can still set the language
    language: detectLanguage(`${job.title}\n${read.text || source.stored}`),
  }
}

export async function documentsForJob(
  userId: number,
  jobId: string
): Promise<{ cvId: string | null; letterId: string | null }> {
  const rows = await db.cvDocument.findMany({
    where: { userId, jobId },
    select: { id: true, docType: true },
  })
  return {
    cvId: rows.find((row) => row.docType === "CV")?.id ?? null,
    letterId: rows.find((row) => row.docType === "LETTER")?.id ?? null,
  }
}

export async function tailorContext(userId: number, doc: CvDetail): Promise<TailorContext | null> {
  if (!doc.target) return null
  const { jobId } = doc.target
  const [documents, job] = await Promise.all([
    jobId ? documentsForJob(userId, jobId) : null,
    jobId ? db.job.findUnique({ where: { id: jobId }, select: { originalUrl: true } }) : null,
  ])
  return {
    job: {
      id: jobId,
      company: doc.target.company,
      title: doc.target.title,
      url: job?.originalUrl ?? null,
    },
    cvId: documents?.cvId ?? (doc.docType === "CV" ? doc.id : null),
    letterId: documents?.letterId ?? (doc.docType === "LETTER" ? doc.id : null),
    notes: parseTailorNotes(doc.tailorNotes),
  }
}

/** The CV to start from: the chosen one, else the default, else one made from the profile. */
async function resolveBase(userId: number, baseCvId?: string): Promise<CvDetail> {
  const chosen = baseCvId ? await getCv(userId, baseCvId) : await defaultCv(userId)
  if (baseCvId && (!chosen || chosen.docType !== "CV"))
    throw new CvError("not-found", "CV not found.")
  if (chosen?.content) return chosen
  if (chosen) {
    // an uploaded PDF: the editable copy made from it before, so no offer reads the file again
    const copy = await db.cvDocument.findFirst({
      where: { userId, baseCvId: chosen.id, kind: "EDITABLE", targetCompany: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })
    const existing = copy ? await getCv(userId, copy.id) : null
    if (existing?.content) return existing
    const { cv } = await createEditableFromUpload(userId, chosen.id)
    return cv
  }
  const profile = await db.candidateProfile.count({ where: { userId } })
  if (!profile) throw new CvError("no-base", "There is no CV or profile to start from.")
  return createCv({ userId, from: "profile" })
}

type ExistingDocument = {
  id: string
  content: unknown
  language: string
  baseCvId: string | null
}

async function findExisting(
  userId: number,
  jobId: string,
  docType: "CV" | "LETTER"
): Promise<ExistingDocument | null> {
  return db.cvDocument.findUnique({
    where: { userId_jobId_docType: { userId, jobId, docType } },
    select: { id: true, content: true, language: true, baseCvId: true },
  })
}

/** Tailoring again starts from the general CV it started from, not from the last result. */
async function baseForTailoring(
  userId: number,
  existing: ExistingDocument | null,
  baseCvId?: string
): Promise<{ id: string | null; content: CvContent; language: CvLanguage }> {
  const fromDocument = (cv: CvDetail) => {
    if (!cv.content) throw new CvError("no-content", "This CV has no editable content.")
    return { id: cv.id, content: cv.content, language: cv.language }
  }
  if (baseCvId || !existing) return fromDocument(await resolveBase(userId, baseCvId))
  const original = existing.baseCvId ? await getCv(userId, existing.baseCvId) : null
  if (original?.content) return fromDocument(original)
  const first = await db.cvVersion.findFirst({
    where: { documentId: existing.id, origin: "base" },
    orderBy: { number: "asc" },
    select: { content: true, language: true },
  })
  const content = parseCvContent(first?.content ?? existing.content)
  if (!content) throw new CvError("no-content", "This CV has no editable content.")
  return { id: null, content, language: cvLocale(first?.language) }
}

/** How many times this document was generated: a new attempt must not hit the reply cache. */
async function attemptNumber(documentId: string | undefined): Promise<number> {
  if (!documentId) return 1
  const generated = await db.cvVersion.count({ where: { documentId, origin: "generated" } })
  return generated + 1
}

function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

/**
 * Writes the generated text as the newest version. A document that already exists keeps its
 * current state in history first, so generating again never loses an edit.
 */
async function storeGenerated(input: {
  userId: number
  job: TailorJob
  docType: "CV" | "LETTER"
  language: CvLanguage
  content: CvContent
  notes: TailorNotes
  base?: { id: string | null; content: CvContent; language: CvLanguage } | null
}): Promise<{ id: string; updatedAt: Date }> {
  const { userId, job, docType, language, content, notes, base } = input
  const write = () =>
    db.$transaction(async (tx): Promise<{ id: string; updatedAt: Date }> => {
      const existing = await tx.cvDocument.findUnique({
        where: { userId_jobId_docType: { userId, jobId: job.id, docType } },
        select: { id: true, content: true, language: true },
      })
      const fields = {
        language,
        content: toStoredJson(content),
        tailorNotes: notes,
        targetCompany: job.company,
        targetTitle: job.title,
        versionCheckedAt: new Date(),
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
      }
      let id: string
      let updatedAt: Date
      if (existing) {
        await keepCurrentState(tx, existing)
        const written = await tx.cvDocument.update({
          where: { id: existing.id },
          data: { ...fields, ...(base?.id ? { baseCvId: base.id } : {}) },
          select: { updatedAt: true },
        })
        id = existing.id
        updatedAt = written.updatedAt
      } else {
        const created = await tx.cvDocument.create({
          data: {
            ...fields,
            userId,
            jobId: job.id,
            docType,
            kind: "EDITABLE",
            title: `${job.company} · ${job.title}`.slice(0, 160),
            isDefault: false,
            baseCvId: base?.id ?? null,
          },
          select: { id: true, updatedAt: true },
        })
        id = created.id
        updatedAt = created.updatedAt
        if (base) {
          await appendVersion(tx, {
            documentId: id,
            content: base.content,
            language: base.language,
            origin: "base",
          })
        }
      }
      await appendVersion(tx, { documentId: id, content, language, origin: "generated" })
      return { id, updatedAt }
    })
  try {
    return await write()
  } catch (error) {
    // two requests raced to create it: the other one's document now exists
    if (isUniqueError(error)) return write()
    throw error
  }
}

function writingClient(llm: LlmClient | null | undefined): LlmClient {
  const client = llm === undefined ? createWritingClient() : llm
  if (!client) throw new CvError("llm-unavailable", "No model is configured.")
  return client
}

/**
 * "Dostosuj CV". `llm` is injectable for tests. Throws a CvError; nothing is stored when the model
 * fails. Calling it again for the same offer adds a new version to the same document.
 */
export async function tailorCvForJob(input: {
  userId: number
  jobId: string
  baseCvId?: string
  language?: CvLanguage
  note?: string
  /** The language of the notes for the person */
  locale?: CvLanguage
  llm?: LlmClient | null
  http?: HttpClient
}): Promise<TailorResult> {
  const { userId, jobId, note } = input
  const llm = writingClient(input.llm)
  const job = await loadTailorJob(jobId, { http: input.http })
  if (!job) throw new CvError("job-not-found", "This offer is not in the index.")
  const existing = await findExisting(userId, jobId, "CV")
  const base = await baseForTailoring(userId, existing, input.baseCvId)
  const language: CvLanguage =
    input.language ?? (existing?.language === "en" ? "en" : existing ? "pl" : job.language)
  const attempt = await attemptNumber(existing?.id)

  const generated = await tailorCv({
    llm,
    base,
    offer: job,
    language,
    locale: input.locale,
    context: await candidateContext(userId),
    note,
    attempt,
    userId,
  })
  if (!generated) throw new CvError("llm-failed", "The model did not return a usable CV.")
  const { content, notes } = generated
  const { id, updatedAt } = await storeGenerated({
    userId,
    job,
    docType: "CV",
    language,
    content,
    notes,
    base,
  })
  // an application made before tailoring now shows the CV written for it
  await db.application.updateMany({
    where: { userId, jobId, cvDocumentId: null },
    data: { cvDocumentId: id },
  })
  return { id, content, language, notes, updatedAt }
}

/**
 * The cover letter for an offer. It builds on the CV tailored to the offer when there is one, so
 * the two tell the same story. Calling it again adds a new version.
 */
export async function generateLetterForJob(input: {
  userId: number
  jobId: string
  language?: CvLanguage
  note?: string
  llm?: LlmClient | null
  http?: HttpClient
}): Promise<TailorResult> {
  const { userId, jobId, note } = input
  const llm = writingClient(input.llm)
  const job = await loadTailorJob(jobId, { http: input.http })
  if (!job) throw new CvError("job-not-found", "This offer is not in the index.")
  const [existing, tailoredCv] = await Promise.all([
    findExisting(userId, jobId, "LETTER"),
    findExisting(userId, jobId, "CV"),
  ])
  const tailoredContent = parseCvContent(tailoredCv?.content)
  const source = tailoredContent ?? (await resolveBase(userId)).content
  if (!source) throw new CvError("no-base", "There is no CV to write from.")
  const language: CvLanguage =
    input.language ??
    (existing?.language === "en" || (!existing && tailoredCv?.language === "en")
      ? "en"
      : existing || tailoredCv
      ? "pl"
      : job.language)
  const attempt = await attemptNumber(existing?.id)

  const generated = await writeCoverLetter({
    llm,
    cv: source,
    offer: job,
    language,
    context: await candidateContext(userId),
    note,
    attempt,
    userId,
  })
  if (!generated) throw new CvError("llm-failed", "The model did not return a usable letter.")
  const { content, notes } = generated
  const { id, updatedAt } = await storeGenerated({
    userId,
    job,
    docType: "LETTER",
    language,
    content,
    notes,
  })
  return { id, content, language, notes, updatedAt }
}
