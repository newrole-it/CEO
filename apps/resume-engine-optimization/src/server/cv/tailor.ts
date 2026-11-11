import { Prisma } from "@prisma/client"
import db from "db"
import {
  coverLetterLanguage,
  tailorCv,
  tailoredCvLanguage,
  writeCoverLetter,
  writeGeneralLetter,
  type GeneralLetter,
  type PastLetter,
  type TailorOffer,
} from "@newrole/cv-engine/tailor"
import { analyzeOffer, checkBullets, matchCv, type MatchOffer } from "@newrole/cv-engine/match"
import type { LlmClient } from "@newrole/llm/common"
import { atsReport, checkCv } from "@newrole/cv-core/ats"
import { companyConsent, consentCompanyOf, cvLocale } from "@newrole/cv-core/blank"
import { detectLanguage } from "@newrole/cv-core/language"
import { commentsForModel, type MatchNotes, type MatchReport } from "@newrole/cv-core/match"
import type { StepReporter, StepUpdate, TailorStep } from "@newrole/cv-core/progress"
import { letterSection, parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { inlineToText } from "@newrole/cv-core/sanitize"
import {
  OFFER_TEXT_LIMIT,
  parseTailorNotes,
  refreshKeywordNotes,
  unverifiedNumbers,
  unverifiedTerms,
  type OfferTextOrigin,
  type TailorNotes,
} from "@newrole/cv-core/tailor"
import { cvPlainText } from "@newrole/cv-core/text"
import type { GeneralCvCheck, TailorContext, TailorResult } from "@newrole/cv-core/views"
import {
  indexedOfferText,
  offerSourceSelect,
  readOfferText,
  savedOfferText,
  toOfferSource,
} from "src/server/offers/text"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import { keepCommentsAsFacts } from "src/server/profile/facts"
import type { HttpClient } from "src/server/security/safe-fetch"
import { companyFree } from "./company-free"
import { recentLetters } from "./letters"
import {
  createCv,
  createGeneralLetter,
  CvError,
  defaultCv,
  generalLetterOf,
  getCv,
  type CvDetail,
  type CvLanguage,
} from "./service"
import { appendRound, getRound, listRounds } from "./match-rounds"
import { createEditableFromUpload } from "./structure"
import { appendVersion, contentHash, keepCurrentState, toStoredJson } from "./versions"

/**
 * A CV and a cover letter written for one offer in the index: @newrole/cv-engine writes them,
 * this module picks the base CV, reads the offer and keeps every generation as a version. The
 * letter for an offer is made from the general letter of the CV it was tailored from.
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

export type { TailorContext, TailorResult }

/**
 * The person's own copy of the offer when they keep one; else the index only, unless `live` asks
 * for the whole offer from its source.
 */
export async function loadTailorJob(
  jobId: string,
  live?: { http?: HttpClient },
  userId?: number | null
): Promise<TailorJob | null> {
  const job = await db.job.findUnique({
    where: { id: jobId },
    select: { ...offerSourceSelect, locationText: true },
  })
  if (!job) return null
  const source = toOfferSource(job)
  const saved = userId ? await savedOfferText(userId, jobId) : null
  const read = saved ?? (live ? await readOfferText(source, live.http) : indexedOfferText(source))
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
  const [documents, job, general] = await Promise.all([
    jobId ? documentsForJob(userId, jobId) : null,
    jobId ? db.job.findUnique({ where: { id: jobId }, select: { originalUrl: true } }) : null,
    doc.docType === "CV" ? generalCvOf(userId, doc.id) : null,
  ])
  const choices = doc.docType === "CV" && !general ? await generalChoices(userId) : []
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
    general: general
      ? { id: general.id, title: general.title, language: cvLocale(general.language) }
      : null,
    choices: choices.map((choice) => ({ ...choice, language: cvLocale(choice.language) })),
  }
}

/** The editable general CV a CV for an offer was tailored from, if it is still there. */
function generalCvOf(userId: number, tailoredId: string) {
  return db.cvDocument.findFirst({
    where: {
      userId,
      kind: "EDITABLE",
      docType: "CV",
      targetCompany: null,
      tailored: { some: { id: tailoredId } },
    },
    select: { id: true, title: true, language: true },
  })
}

/** The editable general CVs a CV for an offer can be saved into, the default first. */
function generalChoices(userId: number) {
  return db.cvDocument.findMany({
    where: { userId, kind: "EDITABLE", docType: "CV", targetCompany: null },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: { id: true, title: true, language: true },
  })
}

/** A CV for an offer, of this person, with content; null for anything else. */
async function tailoredCvOf(userId: number, id: string) {
  const row = await db.cvDocument.findFirst({
    where: { id, userId, kind: "EDITABLE", docType: "CV", targetCompany: { not: null } },
    select: { content: true, language: true, targetCompany: true, targetTitle: true },
  })
  const content = parseCvContent(row?.content)
  return row && content
    ? {
        id,
        content,
        language: cvLocale(row.language),
        company: row.targetCompany,
        title: row.targetTitle,
      }
    : null
}

type TailoredCv = NonNullable<Awaited<ReturnType<typeof tailoredCvOf>>>

/**
 * The content a CV for an offer gives a general CV (./company-free.ts): `generalId` is the one it
 * goes into, null for a new one. The person's own CV is the one it was first tailored from, as the
 * history of the CV for the offer keeps it, else that general CV as it is now.
 */
async function asGeneral(tailored: TailoredCv, generalId: string | null) {
  const [general, first] = await Promise.all([
    generalId
      ? db.cvDocument.findUnique({
          where: { id: generalId },
          select: { content: true, language: true },
        })
      : null,
    db.cvVersion.findFirst({
      where: { documentId: tailored.id, origin: "base" },
      orderBy: { number: "asc" },
      select: { content: true },
    }),
  ])
  const current = general ? parseCvContent(general.content) : null
  return companyFree({
    content: tailored.content,
    language: tailored.language,
    company: tailored.company,
    general: general ? { content: current, language: cvLocale(general.language) } : null,
    own: parseCvContent(first?.content) ?? current,
  })
}

/**
 * What saving a CV for an offer as general (saveToGeneralCv) would carry of the offer's company,
 * for the person to see before they save; `into` as there. Null when `id` is not a CV for an offer.
 */
export async function checkGeneralCv(
  userId: number,
  id: string,
  into?: string
): Promise<GeneralCvCheck | null> {
  const tailored = await tailoredCvOf(userId, id)
  if (!tailored) return null
  const linked = await generalCvOf(userId, id)
  const target =
    linked ??
    (into && into !== "new"
      ? (await generalChoices(userId)).find((choice) => choice.id === into)
      : null)
  return (await asGeneral(tailored, target?.id ?? null)).check
}

/**
 * "Zapisz jako ogólne CV": the content of a CV for an offer, edits included, becomes the newest
 * version of the general CV it was tailored from. That CV's state before is kept in its history,
 * so it can be restored. When that CV is gone, `into` names another editable general CV, or "new"
 * makes one from this content; either way the CV for the offer is linked to it from then on.
 * A consent clause that names the offer's company does not go over (./company-free.ts).
 * `number` is null when the general CV already had this content or was just made; the result is
 * null when `id` is not a CV for an offer, or there is no general CV to save into.
 */
export async function saveToGeneralCv(
  userId: number,
  id: string,
  into?: string
): Promise<{ cvId: string; title: string; number: number | null; created: boolean } | null> {
  const tailored = await tailoredCvOf(userId, id)
  if (!tailored) return null
  const { language } = tailored
  const linked = await generalCvOf(userId, id)
  if (!linked && into === "new") {
    const { content } = await asGeneral(tailored, null)
    const created = await createCv({
      userId,
      from: "content",
      content,
      language,
      title: tailored.title ?? undefined,
    })
    await db.cvDocument.update({
      where: { id },
      data: { baseCvId: created.id },
      select: { id: true },
    })
    return { cvId: created.id, title: created.title, number: null, created: true }
  }
  const general =
    linked ?? (into ? (await generalChoices(userId)).find((choice) => choice.id === into) : null)
  if (!general) return null
  const { content } = await asGeneral(tailored, general.id)
  // from now on this CV for an offer comes from the one it was saved into
  if (!linked) {
    await db.cvDocument.update({
      where: { id },
      data: { baseCvId: general.id },
      select: { id: true },
    })
  }
  const saved = await db.$transaction(async (tx) => {
    // read again inside, so a save that landed since is the state kept in the history
    const current = await tx.cvDocument.findUnique({
      where: { id: general.id },
      select: { id: true, content: true, language: true },
    })
    if (!current) throw new CvError("not-found", "CV not found.")
    const stored = parseCvContent(current.content)
    if (stored && current.language === language && contentHash(stored) === contentHash(content)) {
      return { number: null }
    }
    await keepCurrentState(tx, current)
    await tx.cvDocument.update({
      where: { id: general.id },
      data: {
        content: toStoredJson(content),
        language,
        versionCheckedAt: new Date(),
        // the stored PDF no longer matches; cvPdf renders a new one on demand
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
      },
      select: { id: true },
    })
    const row = await appendVersion(tx, {
      documentId: general.id,
      content,
      language,
      origin: "offer",
      label: [tailored.company, tailored.title].filter(Boolean).join(" · "),
    })
    return { number: row.number }
  })
  return { cvId: general.id, title: general.title, number: saved.number, created: false }
}

/** The CV to start from: the chosen one, else the default, else one made from the profile. */
async function resolveBase(userId: number, baseCvId?: string): Promise<CvDetail> {
  const chosen = baseCvId ? await getCv(userId, baseCvId) : await defaultCv(userId)
  if (baseCvId && (!chosen || chosen.docType !== "CV"))
    throw new CvError("not-found", "CV not found.")
  if (chosen?.content) return chosen
  if (chosen) {
    // an uploaded PDF becomes editable in place, once, so no other offer reads the file again
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
  tailorNotes: unknown
}

async function findExisting(
  userId: number,
  jobId: string,
  docType: "CV" | "LETTER"
): Promise<ExistingDocument | null> {
  return db.cvDocument.findUnique({
    where: { userId_jobId_docType: { userId, jobId, docType } },
    select: { id: true, content: true, language: true, baseCvId: true, tailorNotes: true },
  })
}

/** The letter already written for an offer, when it has one with content. */
export async function letterForJob(
  userId: number,
  jobId: string
): Promise<{ id: string; content: CvContent; language: CvLanguage } | null> {
  const existing = await findExisting(userId, jobId, "LETTER")
  const content = parseCvContent(existing?.content)
  return existing && content
    ? { id: existing.id, content, language: cvLocale(existing.language) }
    : null
}

/** The general letter the letters for an offer are made from, with its document's id. */
export type GeneralLetterDoc = GeneralLetter & { id: string }

/**
 * The general letter to make this offer's letter from: the one of the general CV its tailored CV
 * started from, else the default CV's. `jobId` null: the default CV's, for a page outside the index.
 */
export async function generalLetterForJob(
  userId: number,
  jobId: string | null
): Promise<GeneralLetterDoc | null> {
  const tailored = jobId ? await findExisting(userId, jobId, "CV") : null
  // a CV tailored before its base was recorded falls back to the default, as a page outside does
  const cvId = tailored?.baseCvId ?? (await defaultCv(userId))?.id
  const letter = cvId ? await generalLetterOf(userId, cvId) : null
  return letter ? { id: letter.id, content: letter.content, language: letter.language } : null
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
        select: { id: true, content: true, language: true, tailorNotes: true, updatedAt: true },
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
      if (docType === "CV" && notes.match) {
        await appendRound(tx, {
          userId,
          documentId: id,
          notes,
          before: existing ? { notes: existing.tailorNotes, at: existing.updatedAt } : null,
        })
      }
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

/**
 * A round that only checked the CV again: its notes and a new round, the CV as it was. updatedAt
 * stays, as for an audit: it says when the CV last changed.
 */
async function storeAudit(input: {
  userId: number
  documentId: string
  notes: TailorNotes
}): Promise<{ id: string; updatedAt: Date }> {
  const { userId, documentId, notes } = input
  return db.$transaction(async (tx) => {
    const row = await tx.cvDocument.findUnique({
      where: { id: documentId },
      select: { tailorNotes: true, updatedAt: true },
    })
    if (!row) throw new CvError("not-found", "CV not found.")
    await tx.cvDocument.update({
      where: { id: documentId },
      data: { tailorNotes: notes, updatedAt: row.updatedAt },
      select: { id: true },
    })
    await appendRound(tx, {
      userId,
      documentId,
      notes,
      before: { notes: row.tailorNotes, at: row.updatedAt },
    })
    return { id: documentId, updatedAt: row.updatedAt }
  })
}

function writingClient(llm: LlmClient | null | undefined): LlmClient {
  const client = llm === undefined ? createWritingClient() : llm
  if (!client) throw new CvError("llm-unavailable", "No model is configured.")
  return client
}

/**
 * The steps of one run as they happen: each is reported running, then done with what it found,
 * skipped when there was nothing to do, or failed. A step that throws is logged and counts as
 * failed; the run goes on without it.
 */
function stepLog(onStep: StepReporter | undefined) {
  const log = new Map<TailorStep, StepUpdate>()
  const report = (update: StepUpdate) => {
    log.set(update.step, update)
    onStep?.(update)
  }
  async function run<T>(
    step: TailorStep,
    work: (() => Promise<T | null> | T | null) | null,
    detail: (result: T) => Record<string, number>
  ): Promise<T | null> {
    if (!work) {
      report({ step, state: "skipped" })
      return null
    }
    report({ step, state: "running" })
    try {
      const result = await work()
      report(
        result == null ? { step, state: "failed" } : { step, state: "done", detail: detail(result) }
      )
      return result
    } catch (error) {
      console.error(`tailoring step ${step} failed`, error instanceof Error ? error.message : error)
      report({ step, state: "failed" })
      return null
    }
  }
  return { run, report, steps: () => [...log.values()] }
}

/**
 * Every line of the CV's own text, for checking the names and numbers of a finished CV. A bullet
 * loses its "- ", so its first word reads as the start of a sentence, not as a name.
 */
function cvLines(content: CvContent): string[] {
  return cvPlainText(content)
    .split("\n")
    .map((line) => line.replace(/^-\s+/, ""))
    .filter((line) => line.trim())
}

/** The round after the newest one of a CV for an offer (nextMatchRound). */
type NextRound = {
  /** False only checks the CV again, as the person left it */
  rewrite: boolean
  /**
   * With `rewrite`, the model writes from the person's own CV, as tailoring did the first time,
   * not from the CV for the offer as it is now
   */
  fresh?: boolean
  /**
   * What the round before found: its analysis of the offer is kept, so rounds compare. For a CV
   * tailored before matches were scored, the notes its tailoring left, which have no analysis.
   */
  notes: TailorNotes | null
  /** The person's comments on it, for the model (commentsForModel) */
  comments: string
}

/**
 * "Dostosuj CV": the steps of @newrole/cv-core/progress in order. The offer is read and the
 * person's data checked against it, the CV is tailored with what that found, its bullets are
 * checked, and code checks keywords, layout, numbers and names of the result. Only tailoring
 * itself must succeed; any other step that fails leaves its part of the notes empty. `llm` is
 * injectable for tests. Throws a CvError; nothing is stored when tailoring fails. Calling it again
 * for the same offer adds a new version to the same document. Every run adds a round of the match
 * (./match-rounds).
 *
 * `round` is the next round of the CV already written for the offer: the model works on that CV
 * as it is now, with the person's comments, and every claim is still checked against the person's
 * own CV and profile, not against the CV it rewrites.
 */
export async function tailorCvForJob(input: {
  userId: number
  jobId: string
  baseCvId?: string
  language?: CvLanguage
  note?: string
  /** The language of the notes for the person; the CV's language when not given */
  locale?: CvLanguage
  llm?: LlmClient | null
  http?: HttpClient
  /** Told about each step as it starts and ends (src/server/cv/tailor-progress.ts) */
  onStep?: StepReporter
  round?: NextRound
  /**
   * The company the consent clause names (companyConsent), in the CV's language. Without it the
   * clause stays as the CV it starts from has it.
   */
  consentCompany?: string
}): Promise<TailorResult> {
  const { userId, jobId, note, round } = input
  const llm = writingClient(input.llm)
  const job = await loadTailorJob(jobId, { http: input.http }, userId)
  if (!job) throw new CvError("job-not-found", "This offer is not in the index.")
  const existing = await findExisting(userId, jobId, "CV")
  const current = round ? parseCvContent(existing?.content) : null
  if (round && (!existing || !current)) throw new CvError("not-found", "CV not found.")
  // the person's own CV: what the match reads and every claim is checked against
  const origin = await baseForTailoring(userId, existing, input.baseCvId)
  // the CV the model works on: in a next round, the one written for the offer, unless it starts
  // again from the person's own
  const base =
    current && existing && !round?.fresh
      ? { id: null, content: current, language: cvLocale(existing.language) }
      : origin
  const language = tailoredCvLanguage({
    requested: input.language,
    existing,
    offer: job.language,
  })
  const locale = input.locale ?? language
  const [attempt, context] = await Promise.all([
    attemptNumber(existing?.id),
    candidateContext(userId),
  ])
  const evidence = `${cvPlainText(origin.content)}\n${context}`
  const offer: MatchOffer = { company: job.company, title: job.title, text: job.text }
  const steps = stepLog(input.onStep)

  const kept = round?.notes?.match?.analysis ?? null
  const analysis = await steps.run(
    "offer",
    kept
      ? () => kept
      : job.text || note?.trim()
        ? () => analyzeOffer({ llm, offer, note, locale, userId })
        : null,
    (result) => ({
      required: result.requirements.filter((item) => item.importance === "required").length,
      preferred: result.requirements.filter((item) => item.importance === "preferred").length,
      soft: result.requirements.filter((item) => item.importance === "soft").length,
      keywords: result.keywords.length,
      redFlags: result.redFlags.length,
      ...(kept ? { kept: 1 } : {}),
    })
  )

  const before =
    (await steps.run(
      "cv",
      () => checkCv(base.content),
      (check) => ({
        bullets: check.bullets,
        withNumber: check.withNumber,
        weakStart: check.weakStart,
        long: check.long,
      })
    )) ?? checkCv(base.content)

  const match: MatchReport | null = await steps.run(
    "match",
    analysis
      ? () =>
          matchCv({
            llm,
            analysis,
            offer,
            cv: origin.content,
            context,
            evidence,
            locale,
            userId,
            comments: round?.comments,
          })
      : null,
    (report) => ({
      ...(report.score == null ? {} : { score: report.score }),
      met: report.groups.required.met,
      partial: report.groups.required.partial,
      total: report.groups.required.total,
      critical: report.critical,
    })
  )

  const tailor = async () => {
    steps.report({ step: "tailor", state: "running" })
    let result: Awaited<ReturnType<typeof tailorCv>>
    try {
      result = await tailorCv({
        llm,
        base,
        offer: job,
        language,
        locale,
        context,
        note,
        attempt,
        userId,
        analysis,
        match,
        comments: round?.comments,
      })
    } catch (error) {
      steps.report({ step: "tailor", state: "failed" })
      throw error
    }
    if (!result) {
      steps.report({ step: "tailor", state: "failed" })
      throw new CvError("llm-failed", "The model did not return a usable CV.")
    }
    const keywordsIn = (result.notes.keywords ?? []).filter(
      (item) => item.status === "kept" || item.status === "added"
    ).length
    steps.report({
      step: "tailor",
      state: "done",
      detail: {
        changes: result.notes.changes.length,
        keywordsIn,
        keywords: result.notes.keywords?.length ?? 0,
        reverted: result.notes.reverted,
      },
    })
    return result
  }
  const generated = round && !round.rewrite ? null : await tailor()
  if (!generated) steps.report({ step: "tailor", state: "skipped" })

  const bullets = await steps.run(
    "bullets",
    generated &&
      (() =>
        checkBullets({
          llm,
          cv: generated.content,
          language,
          locale,
          analysis,
          offer,
          context,
          evidence,
          userId,
        })),
    (result) => ({
      checked: result.report.checked,
      flagged: result.report.flagged,
      rewritten: result.report.rewritten,
      questions: result.report.questions.length,
    })
  )
  const drafted = bullets?.content ?? generated?.content ?? base.content
  // only a rewritten CV is stored, so only a rewrite takes the clause
  const company = generated ? input.consentCompany?.trim() : ""
  const content = company ? { ...drafted, consent: companyConsent(language, company) } : drafted
  // what the model wrote now, else what the round before wrote when this one only checks; a CV
  // whose notes no longer read keeps none of that
  const written =
    generated?.notes ??
    (round
      ? (round.notes ?? {
          changes: [],
          gaps: [],
          unverified: [],
          reverted: 0,
          usedJobText: Boolean(analysis),
        })
      : null)
  if (!written) throw new CvError("llm-failed", "The model did not return a usable CV.")

  // the offer's keywords when it was analysed, else the ones tailoring listed
  const keywords = analysis
    ? analysis.keywords.map((item) => ({ term: item.term, importance: item.importance }))
    : (written.keywords ?? []).map((item) => ({
        term: item.term,
        importance: "preferred" as const,
      }))
  const ats = (await steps.run(
    "ats",
    () => ({ before: atsReport(base.content, keywords), after: atsReport(content, keywords) }),
    (result) => ({
      ...(result.before.score == null ? {} : { before: result.before.score }),
      ...(result.after.score == null ? {} : { after: result.after.score }),
      found: result.after.found,
      total: result.after.total,
      oddTitles: result.after.check.oddTitles.length,
    })
  )) ?? { before: atsReport(base.content, keywords), after: atsReport(content, keywords) }

  const translated = language !== origin.language
  const reverted = generated
    ? generated.notes.reverted + (bullets?.report.reverted ?? 0)
    : written.reverted
  const facts = (await steps.run(
    "facts",
    () => {
      const lines = cvLines(content)
      const found = new Map(
        [
          ...(generated?.notes.unverified ?? []),
          ...(bullets?.unverified ?? []),
          ...unverifiedTerms(lines, evidence, { translated }),
          ...unverifiedNumbers(lines, evidence),
        ].map((term) => [term.toLowerCase(), term])
      )
      return { unverified: [...found.values()].slice(0, 12), reverted }
    },
    (result) => ({ unverified: result.unverified.length, reverted: result.reverted })
  )) ?? { unverified: written.unverified, reverted }

  const matchNotes: MatchNotes = {
    analysis,
    report: match,
    cv: { before, after: ats.after.check },
    ats,
    bullets: bullets?.report ?? null,
    steps: steps.steps(),
  }
  const notes: TailorNotes = {
    ...written,
    unverified: facts.unverified,
    reverted: facts.reverted,
    keywords: refreshKeywordNotes(written.keywords, content),
    match: matchNotes,
  }
  const { id, updatedAt } =
    generated || !existing
      ? await storeGenerated({
          userId,
          job,
          docType: "CV",
          language,
          content,
          notes,
          base: origin,
        })
      : await storeAudit({ userId, documentId: existing.id, notes })
  // an application made before tailoring now shows the CV written for it
  await db.application.updateMany({
    where: { userId, jobId, cvDocumentId: null },
    data: { cvDocumentId: id },
  })
  return { id, content, language, notes, updatedAt }
}

/**
 * "Popraw CV i sprawdź ponownie" on the match dashboard: the newest round's comments become the
 * person's facts (src/server/profile/facts.ts), then the next round runs on the CV written for
 * the offer. `rewrite` false checks it again without rewriting it, after the person edited it.
 * `fresh` ("Stwórz nowe CV pod tę ofertę") writes it anew from the general CV it was tailored
 * from, as that CV is now, and keeps the company its consent clause names.
 * A CV tailored before matches were scored gets its first round this way.
 */
export async function nextMatchRound(input: {
  userId: number
  jobId: string
  rewrite: boolean
  fresh?: boolean
  locale?: CvLanguage
  llm?: LlmClient | null
  http?: HttpClient
  onStep?: StepReporter
}): Promise<TailorResult & { round: number }> {
  const { userId, jobId } = input
  const fresh = Boolean(input.fresh)
  const rewrite = input.rewrite || fresh
  const existing = await findExisting(userId, jobId, "CV")
  if (!existing) throw new CvError("not-found", "CV not found.")
  // a CV tailored before rounds were kept gets its first one now
  await listRounds(userId, existing.id)
  const last = await getRound(userId, existing.id)
  if (last) await keepCommentsAsFacts(userId, jobId, last.comments)
  // a CV tailored before matches were scored has no round: this one is its first
  const result = await tailorCvForJob({
    userId,
    jobId,
    locale: input.locale,
    llm: input.llm,
    http: input.http,
    onStep: input.onStep,
    // the general CV has its own clause; a company the CV for the offer named stays named
    consentCompany: fresh
      ? (consentCompanyOf(parseCvContent(existing.content)?.consent) ?? undefined)
      : undefined,
    round: {
      rewrite,
      fresh,
      notes: last?.notes ?? parseTailorNotes(existing.tailorNotes),
      comments: last ? commentsForModel(last.comments, last.notes.match ?? null) : "",
    },
  })
  return { ...result, round: (last?.number ?? 0) + 1 }
}

/** The match with the offer kept with a tailored CV, for the letter that goes with it. */
async function matchOfCv(cvId: string): Promise<MatchReport | null> {
  const row = await db.cvDocument.findUnique({
    where: { id: cvId },
    select: { tailorNotes: true },
  })
  return parseTailorNotes(row?.tailorNotes)?.match?.report ?? null
}

/**
 * The posting as the person sees it, for an offer whose source gave nothing but the index's
 * excerpt. A site that opts out of AI use keeps its text from the model here too.
 */
function withPageText(job: TailorJob, pageText: string | undefined): TailorJob {
  const text = pageText?.trim().slice(0, OFFER_TEXT_LIMIT) ?? ""
  if (!text || job.withheld || job.origin === "full" || text.length <= job.text.length) return job
  return { ...job, text, origin: "full", language: detectLanguage(`${job.title}\n${text}`) }
}

/**
 * The cover letter for an offer. It builds on the CV tailored to the offer when there is one, so
 * the two tell the same story, and on the person's last three letters, so it sounds like them.
 * Calling it again adds a new version.
 */
export async function generateLetterForJob(input: {
  userId: number
  jobId: string
  language?: CvLanguage
  note?: string
  /** The person's last letters; read here when not given */
  pastLetters?: PastLetter[]
  /** The general letter to make it from; read here when not given, null for none */
  general?: GeneralLetterDoc | null
  /** The most characters the paragraphs may take, for a form field with a limit */
  maxChars?: number
  /** The open page's text (the Chrome extension), used when the offer's source cannot be read */
  pageText?: string
  llm?: LlmClient | null
  http?: HttpClient
  /** Told about the letter's steps as they start and end (src/server/cv/tailor-progress.ts) */
  onStep?: StepReporter
}): Promise<TailorResult> {
  const { userId, jobId, note } = input
  const llm = writingClient(input.llm)
  const steps = stepLog(input.onStep)
  const loaded = await loadTailorJob(jobId, { http: input.http }, userId)
  if (!loaded) throw new CvError("job-not-found", "This offer is not in the index.")
  const job = withPageText(loaded, input.pageText)
  const [existing, tailoredCv] = await Promise.all([
    findExisting(userId, jobId, "LETTER"),
    findExisting(userId, jobId, "CV"),
  ])
  const tailoredContent = parseCvContent(tailoredCv?.content)
  const source = tailoredContent ?? (await resolveBase(userId)).content
  if (!source) throw new CvError("no-base", "There is no CV to write from.")
  const language = coverLetterLanguage({
    requested: input.language,
    letter: existing,
    cv: tailoredCv,
    offer: job.language,
  })
  const general =
    input.general !== undefined ? input.general : await generalLetterForJob(userId, jobId)
  const [attempt, context, pastLetters, match] = await Promise.all([
    attemptNumber(existing?.id),
    candidateContext(userId),
    input.pastLetters ?? recentLetters(userId, { exceptJobId: jobId, exceptId: general?.id }),
    tailoredCv ? matchOfCv(tailoredCv.id) : null,
  ])

  steps.report({ step: "letter", state: "running" })
  let generated: Awaited<ReturnType<typeof writeCoverLetter>>
  try {
    generated = await writeCoverLetter({
      llm,
      cv: source,
      offer: job,
      language,
      context,
      note,
      pastLetters,
      general,
      maxChars: input.maxChars,
      attempt,
      userId,
      match,
    })
  } catch (error) {
    steps.report({ step: "letter", state: "failed" })
    throw error
  }
  if (!generated) {
    steps.report({ step: "letter", state: "failed" })
    throw new CvError("llm-failed", "The model did not return a usable letter.")
  }
  const { content, notes } = generated
  const words = (letterSection(content)?.paragraphs ?? [])
    .map((paragraph) => inlineToText(paragraph))
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length
  steps.report({ step: "letter", state: "done", detail: { words } })
  // writeCoverLetter has checked every number and name of the reply against the person's data
  steps.report({
    step: "letterFacts",
    state: "done",
    detail: { unverified: notes.unverified.length },
  })
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

/**
 * A cover letter for a posting that is not in the index, such as a company's own careers page
 * without a JobPosting: written the same way from the person's default CV, and kept nowhere.
 */
export async function writeLetterForPage(input: {
  userId: number
  offer: TailorOffer
  pastLetters: PastLetter[]
  /** The default CV's general letter (generalLetterForJob with no offer) */
  general?: GeneralLetterDoc | null
  maxChars?: number
  llm?: LlmClient | null
}): Promise<{ content: CvContent; language: CvLanguage }> {
  const { userId, offer } = input
  const llm = writingClient(input.llm)
  const [base, context] = await Promise.all([resolveBase(userId), candidateContext(userId)])
  if (!base.content) throw new CvError("no-base", "There is no CV to write from.")
  const language = detectLanguage(`${offer.title}\n${offer.text}`)
  const generated = await writeCoverLetter({
    llm,
    cv: base.content,
    offer,
    language,
    context,
    pastLetters: input.pastLetters,
    general: input.general,
    maxChars: input.maxChars,
    userId,
  })
  if (!generated) throw new CvError("llm-failed", "The model did not return a usable letter.")
  return { content: generated.content, language }
}

/**
 * "Napisz z tego CV": the general letter of a general CV, written by the model from the CV, the
 * person's context and their last letters. A CV that has its letter gets that one back unwritten.
 */
export async function writeGeneralLetterForCv(input: {
  userId: number
  cvId: string
  llm?: LlmClient | null
}): Promise<{ id: string; created: boolean }> {
  const { userId, cvId } = input
  const existing = await db.cvDocument.findFirst({
    where: { userId, baseCvId: cvId, docType: "LETTER", targetCompany: null },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }
  const llm = writingClient(input.llm)
  const chosen = await getCv(userId, cvId)
  if (!chosen || chosen.docType !== "CV" || chosen.target)
    throw new CvError(
      chosen ? "not-general" : "not-found",
      "A general letter goes with a general CV."
    )
  // an uploaded PDF is made editable first, as tailoring does
  const cv = chosen.content ? chosen : await resolveBase(userId, chosen.id)
  if (!cv.content) throw new CvError("no-content", "This CV has no editable content.")
  const [context, pastLetters] = await Promise.all([
    candidateContext(userId),
    recentLetters(userId),
  ])
  const generated = await writeGeneralLetter({
    llm,
    cv: cv.content,
    language: cv.language,
    context,
    pastLetters,
    userId,
  })
  if (!generated) throw new CvError("llm-failed", "The model did not return a usable letter.")
  return createGeneralLetter({
    userId,
    cvId,
    from: "content",
    content: generated.content,
    notes: generated.notes,
  })
}
