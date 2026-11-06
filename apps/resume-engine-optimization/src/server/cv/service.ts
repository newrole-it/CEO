import db from "db"
import { parseApplicant } from "@newrole/profile/applicant"
import { blankCv, cvLocale, type CvLocale } from "@newrole/cv-core/blank"
import { cvFromProfile } from "@newrole/cv-core/from-profile"
import { cvPdfFileName } from "@newrole/cv-core/filename"
import { buildLetter, letterFromText, letterName } from "@newrole/cv-core/letter"
import { cvContentError, parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { parseTailorNotes, type TailorNotes } from "@newrole/cv-core/tailor"
import type { PairContext } from "@newrole/cv-core/views"
import { cvPlainText } from "@newrole/cv-core/text"
import { parseStoredDocument } from "@newrole/profile/linkedin"
import { asStringList } from "@newrole/profile/schema"
import { documentPdfName } from "@newrole/cv-engine/http"
import { renderCvHtml, renderPdfFromHtml } from "@newrole/cv-engine/render"
import { appendVersion, keepPdfVersion, toStoredJson, versionBeforeEdit } from "./versions"

/**
 * CV documents: the person's editable CVs and uploaded PDFs (docs/product/plan-aplikacje.md §5.2),
 * and their cover letters. A general CV and its general letter are a pair: the letter's baseCvId
 * is the CV, and the letters for offers start from it (tailor.ts).
 */

export { cvPdfFileName }

export const MAX_CV_PDF_BYTES = 5_000_000
const MAX_TITLE = 160

export type CvLanguage = CvLocale
export type CvKind = "EDITABLE" | "UPLOADED"
export type CvDocType = "CV" | "LETTER"

export type CvView = {
  id: string
  title: string
  language: CvLanguage
  kind: CvKind
  docType: CvDocType
  isDefault: boolean
  /** A PDF is stored: the uploaded one, or the last render of an editable CV */
  hasPdf: boolean
  hasContent: boolean
  updatedAt: Date
  /** The offer a tailored CV or letter was written for; null for a general CV */
  target: { jobId: string | null; company: string; title: string } | null
  /** A general letter: the general CV it goes with; null for anything else, or when that CV is gone */
  forCvId: string | null
  /** The PDF an editable CV was uploaded as, kept as its version 0; null when it was not uploaded */
  original: { versionId: string; name: string } | null
}

export type CvDetail = CvView & { content: CvContent | null; tailorNotes: unknown }

export type CvErrorCode =
  | "not-found"
  | "invalid-content"
  | "not-pdf"
  | "too-large"
  | "uploaded-readonly"
  | "no-content"
  | "job-not-found"
  | "no-base"
  | "llm-unavailable"
  | "llm-failed"
  /** A general letter goes with a general CV, not with a letter or a CV for an offer */
  | "not-general"
  /** Saved from a stale copy: the stored CV changed after the editor loaded it */
  | "conflict"

export class CvError extends Error {
  constructor(readonly code: CvErrorCode, message: string) {
    super(message)
    this.name = "CvError"
  }
}

const VIEW_FIELDS = {
  id: true,
  title: true,
  language: true,
  kind: true,
  docType: true,
  isDefault: true,
  pdfUpdatedAt: true,
  updatedAt: true,
  jobId: true,
  targetCompany: true,
  targetTitle: true,
  baseCvId: true,
  versions: { where: { origin: "upload" }, select: { id: true, pdfName: true }, take: 1 },
} as const
const DETAIL_FIELDS = { ...VIEW_FIELDS, content: true, tailorNotes: true } as const

/** A CV to apply with in general: not a letter, and not written for one offer. */
const GENERAL_CV = { docType: "CV", targetCompany: null } as const
/** A letter written for no offer; its baseCvId is the general CV it goes with. */
const GENERAL_LETTER = { docType: "LETTER", targetCompany: null } as const

type ViewRow = {
  id: string
  title: string
  language: string
  kind: string
  docType: string
  isDefault: boolean
  pdfUpdatedAt: Date | null
  updatedAt: Date
  jobId: string | null
  targetCompany: string | null
  targetTitle: string | null
  baseCvId: string | null
  versions: { id: string; pdfName: string | null }[]
  content?: unknown
  tailorNotes?: unknown
}

function toView(row: ViewRow, hasContent: boolean): CvView {
  return {
    id: row.id,
    title: row.title,
    language: cvLocale(row.language),
    kind: row.kind === "UPLOADED" ? "UPLOADED" : "EDITABLE",
    docType: row.docType === "LETTER" ? "LETTER" : "CV",
    isDefault: row.isDefault,
    hasPdf: Boolean(row.pdfUpdatedAt),
    hasContent,
    updatedAt: row.updatedAt,
    target: row.targetCompany
      ? { jobId: row.jobId, company: row.targetCompany, title: row.targetTitle ?? "" }
      : null,
    forCvId: row.docType === "LETTER" && !row.targetCompany ? row.baseCvId : null,
    original: row.versions[0]
      ? { versionId: row.versions[0].id, name: row.versions[0].pdfName ?? "CV.pdf" }
      : null,
  }
}

function toDetail(row: ViewRow): CvDetail {
  const content = row.content == null ? null : parseCvContent(row.content)
  return { ...toView(row, Boolean(content)), content, tailorNotes: row.tailorNotes ?? null }
}

function cleanTitle(title: string | null | undefined, fallback: string): string {
  const value = (title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE)
  return value || fallback
}

/** Parses content for a write, or throws a CvError naming the first problem. */
function validContent(value: unknown): CvContent {
  const parsed = parseCvContent(value)
  if (!parsed) throw new CvError("invalid-content", cvContentError(value) ?? "Invalid CV content.")
  return parsed
}

/**
 * Leaves the content out, so a list never loads photos; an editable row always has content.
 * CVs only, tailored ones included; `letters` adds the cover letters.
 */
export async function listCvs(userId: number, opts: { letters?: boolean } = {}): Promise<CvView[]> {
  const rows = await db.cvDocument.findMany({
    where: { userId, ...(opts.letters ? {} : { docType: "CV" }) },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: VIEW_FIELDS,
  })
  return rows.map((row) => toView(row, row.kind !== "UPLOADED"))
}

export async function getCv(userId: number, id: string): Promise<CvDetail | null> {
  const row = await db.cvDocument.findFirst({ where: { id, userId }, select: DETAIL_FIELDS })
  return row ? toDetail(row) : null
}

/**
 * The default CV, else the newest general one (older data may have none marked), else a tailored
 * one when nothing else is left. Never a letter.
 */
export async function defaultCv(userId: number): Promise<CvDetail | null> {
  const row = await db.cvDocument.findFirst({
    where: { userId, docType: "CV" },
    orderBy: [
      { isDefault: "desc" },
      { targetCompany: { sort: "desc", nulls: "first" } },
      { updatedAt: "desc" },
    ],
    select: DETAIL_FIELDS,
  })
  return row ? toDetail(row) : null
}

/** What the "from profile" template needs: the account, form details, profile and imported CV. */
async function profileContent(userId: number, locale: CvLanguage): Promise<CvContent> {
  const [user, profile] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, role: true, applicant: true },
    }),
    db.candidateProfile.findUnique({ where: { userId } }),
  ])
  return cvFromProfile({
    locale,
    name: user?.name,
    email: user && user.role !== "GUEST" ? user.email : null,
    applicant: parseApplicant(user?.applicant),
    document: parseStoredDocument(profile?.linkedinDocument ?? null),
    profile: profile
      ? {
          headline: profile.headline,
          currentTitle: profile.currentTitle,
          homeCity: profile.homeCity,
          locations: asStringList(profile.locations),
          skills: asStringList(profile.skills),
          languages: asStringList(profile.languages),
        }
      : null,
  })
}

/** The CV written for this offer, if there is one. */
export function tailoredCv(
  userId: number,
  jobId: string
): Promise<{ id: string; title: string } | null> {
  return db.cvDocument.findFirst({
    where: { userId, jobId, docType: "CV" },
    select: { id: true, title: true },
  })
}

export async function createCv(input: {
  userId: number
  title?: string
  language?: CvLanguage
  from: "blank" | "profile" | "content"
  content?: CvContent
  /** The uploaded PDF this CV was read from */
  baseCvId?: string
}): Promise<CvDetail> {
  const lang = input.language ?? "pl"
  let content: CvContent
  if (input.from === "content") {
    if (!input.content) throw new CvError("invalid-content", "Missing CV content.")
    content = validContent(input.content)
  } else if (input.from === "profile") {
    content = await profileContent(input.userId, lang)
  } else {
    content = blankCv(lang)
  }
  const name = content.header.name.trim()
  const fallback =
    name && input.from !== "blank" ? `CV ${name}` : lang === "pl" ? "Moje CV" : "My CV"
  const row = await db.$transaction(async (tx) => {
    const existing = await tx.cvDocument.count({ where: { userId: input.userId, ...GENERAL_CV } })
    return tx.cvDocument.create({
      data: {
        userId: input.userId,
        title: cleanTitle(input.title, fallback),
        language: lang,
        kind: "EDITABLE",
        content: toStoredJson(content),
        isDefault: existing === 0,
        baseCvId: input.baseCvId ?? null,
      },
      select: DETAIL_FIELDS,
    })
  })
  return toDetail(row)
}

const CONFLICT_MESSAGE =
  "This CV was changed elsewhere after you opened it. Reload to see the newer version."

/**
 * `baseUpdatedAt` is the updatedAt the editor loaded (or got back from its last save). When the
 * stored CV is newer, another tab or the assistant saved in between, and the write is refused
 * with a "conflict" instead of overwriting that save. Without it the write is unconditional.
 */
export async function updateCv(
  userId: number,
  id: string,
  patch: { title?: string; language?: CvLanguage; content?: CvContent; baseUpdatedAt?: Date }
): Promise<CvDetail> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: {
      id: true,
      kind: true,
      title: true,
      language: true,
      content: patch.content !== undefined,
      versionCheckedAt: true,
      updatedAt: true,
    },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  const base = patch.baseUpdatedAt
  if (base && row.updatedAt.getTime() > base.getTime()) {
    throw new CvError("conflict", CONFLICT_MESSAGE)
  }
  const data: {
    title?: string
    language?: string
    content?: object
    pdf?: null
    pdfName?: null
    pdfUpdatedAt?: null
    versionCheckedAt?: Date
  } = {}
  if (patch.title !== undefined) data.title = cleanTitle(patch.title, row.title)
  if (patch.language !== undefined) data.language = cvLocale(patch.language)
  if (patch.content !== undefined) {
    if (row.kind === "UPLOADED") {
      throw new CvError(
        "uploaded-readonly",
        "An uploaded PDF cannot be edited. Make it editable first."
      )
    }
    const content = validContent(patch.content)
    const checked = await versionBeforeEdit(
      {
        id: row.id,
        content: row.content,
        language: row.language,
        versionCheckedAt: row.versionCheckedAt,
      },
      content
    )
    if (checked) data.versionCheckedAt = checked.checkedAt
    data.content = toStoredJson(content)
    // the stored PDF no longer matches; cvPdf renders a new one on demand
    data.pdf = null
    data.pdfName = null
    data.pdfUpdatedAt = null
  }
  if (base) {
    // written only if no other save landed since the read above
    const written = await db.cvDocument.updateMany({
      where: { id, userId, updatedAt: row.updatedAt },
      data,
    })
    if (written.count === 0) throw new CvError("conflict", CONFLICT_MESSAGE)
    const updated = await db.cvDocument.findFirst({ where: { id, userId }, select: DETAIL_FIELDS })
    if (!updated) throw new CvError("not-found", "CV not found.")
    return toDetail(updated)
  }
  const updated = await db.cvDocument.update({ where: { id }, data, select: DETAIL_FIELDS })
  return toDetail(updated)
}

export async function uploadCvPdf(input: {
  userId: number
  title?: string
  bytes: Buffer
  name: string
  language?: CvLanguage
}): Promise<CvView> {
  if (input.bytes.length > MAX_CV_PDF_BYTES)
    throw new CvError("too-large", "That PDF is larger than 5 MB.")
  if (input.bytes.subarray(0, 4).toString("latin1") !== "%PDF") {
    throw new CvError("not-pdf", "That file is not a PDF.")
  }
  const fileName =
    input.name
      .replace(/[\u0000-\u001f"\\/]+/g, " ")
      .trim()
      .slice(0, 200) || "CV.pdf"
  const row = await db.$transaction(async (tx) => {
    const existing = await tx.cvDocument.count({ where: { userId: input.userId, ...GENERAL_CV } })
    return tx.cvDocument.create({
      data: {
        userId: input.userId,
        title: cleanTitle(input.title, fileName.replace(/\.pdf$/i, "")),
        language: cvLocale(input.language),
        kind: "UPLOADED",
        pdf: input.bytes,
        pdfName: fileName,
        pdfUpdatedAt: new Date(),
        isDefault: existing === 0,
      },
      select: VIEW_FIELDS,
    })
  })
  return toView(row, false)
}

/** A copy of a general CV comes with a copy of its letter, as a pair of their own. */
export async function duplicateCv(userId: number, id: string): Promise<CvDetail> {
  const row = await db.cvDocument.findFirst({ where: { id, userId } })
  if (!row) throw new CvError("not-found", "CV not found.")
  const letter =
    row.docType === "CV" && !row.targetCompany
      ? await db.cvDocument.findFirst({
          where: { userId, baseCvId: row.id, ...GENERAL_LETTER },
          orderBy: { updatedAt: "desc" },
        })
      : null
  const copyOf = (source: typeof row, baseCvId: string | null) => {
    const uploaded = source.kind === "UPLOADED"
    const suffix = cvLocale(source.language) === "en" ? " (copy)" : " (kopia)"
    return {
      userId,
      title: `${source.title.slice(0, MAX_TITLE - suffix.length)}${suffix}`,
      language: source.language,
      kind: source.kind,
      docType: source.docType,
      content: source.content ?? undefined,
      // a rendered PDF is only a cache; the copy renders its own
      pdf: uploaded ? source.pdf : null,
      pdfName: uploaded ? source.pdfName : null,
      pdfUpdatedAt: uploaded ? new Date() : null,
      isDefault: false,
      baseCvId,
    }
  }
  const created = await db.$transaction(async (tx) => {
    const copy = await tx.cvDocument.create({ data: copyOf(row, null), select: DETAIL_FIELDS })
    if (letter) await tx.cvDocument.create({ data: copyOf(letter, copy.id), select: { id: true } })
    return copy
  })
  return toDetail(created)
}

/** Keeps updatedAt as it is: choosing a default neither reorders CVs nor invalidates PDFs. */
async function markDefault(userId: number, id: string): Promise<void> {
  await db.$transaction(async (tx) => {
    const rows = await tx.cvDocument.findMany({
      where: { userId, OR: [{ isDefault: true }, { id }] },
      select: { id: true, updatedAt: true },
    })
    for (const row of rows) {
      await tx.cvDocument.update({
        where: { id: row.id },
        data: { isDefault: row.id === id, updatedAt: row.updatedAt },
      })
    }
  })
}

export async function setDefaultCv(userId: number, id: string): Promise<void> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId, docType: "CV" },
    select: { id: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  await markDefault(userId, id)
}

/**
 * `withLetter` deletes a general CV's letter with it; without it the letter stays, with no CV to
 * go with.
 */
export async function deleteCv(
  userId: number,
  id: string,
  opts: { withLetter?: boolean } = {}
): Promise<void> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { id: true, isDefault: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  await db.$transaction(async (tx) => {
    if (opts.withLetter) {
      await tx.cvDocument.deleteMany({ where: { userId, baseCvId: row.id, ...GENERAL_LETTER } })
    }
    await tx.cvDocument.delete({ where: { id: row.id } })
  })
  if (!row.isDefault) return
  const next = await db.cvDocument.findFirst({
    where: { userId, ...GENERAL_CV },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  if (next) await markDefault(userId, next.id)
}

// ---------------------------------------------------------------- general letters

/** The general CV a general letter is created for; throws for anything else. */
async function generalCvFor(
  userId: number,
  cvId: string
): Promise<{ id: string; title: string; language: CvLanguage; content: CvContent | null }> {
  const row = await db.cvDocument.findFirst({
    where: { id: cvId, userId },
    select: { id: true, title: true, language: true, docType: true, targetCompany: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  if (row.docType !== "CV" || row.targetCompany)
    throw new CvError("not-general", "A general letter goes with a general CV.")
  // a PDF not yet made editable has no content: the profile gives the letter its header
  const own = await getCv(userId, row.id)
  return {
    id: row.id,
    title: row.title,
    language: cvLocale(row.language),
    content: own?.content ?? null,
  }
}

/** The general letter of a general CV, with its content; null when it has none. */
export async function generalLetterOf(
  userId: number,
  cvId: string
): Promise<(CvDetail & { content: CvContent }) | null> {
  const row = await db.cvDocument.findFirst({
    where: { userId, kind: "EDITABLE", baseCvId: cvId, ...GENERAL_LETTER },
    orderBy: { updatedAt: "desc" },
    select: DETAIL_FIELDS,
  })
  const detail = row ? toDetail(row) : null
  return detail?.content ? { ...detail, content: detail.content } : null
}

/**
 * A general letter for a general CV, in the CV's language and with its header: blank, from text
 * the person pasted, or written by the model (tailor.ts). A CV that has its letter keeps it, and
 * gets that one back.
 */
export async function createGeneralLetter(input: {
  userId: number
  cvId: string
  from: "blank" | "text" | "content"
  text?: string
  /** from "content": the model's letter, and what to check in it */
  content?: CvContent
  notes?: TailorNotes
}): Promise<{ id: string; created: boolean }> {
  const { userId } = input
  const cv = await generalCvFor(userId, input.cvId)
  const existing = await db.cvDocument.findFirst({
    where: { userId, baseCvId: cv.id, ...GENERAL_LETTER },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  if (existing) return { id: existing.id, created: false }
  const language = cv.language
  const header = cv.content ?? (await profileContent(userId, language))
  let content: CvContent
  if (input.from === "content") {
    if (!input.content) throw new CvError("invalid-content", "Missing letter content.")
    content = validContent(input.content)
  } else if (input.from === "text") {
    content = validContent(letterFromText({ cv: header, language, text: input.text ?? "" }))
  } else {
    content = validContent(buildLetter({ cv: header, language, paragraphs: [] }))
  }
  const row = await db.$transaction(async (tx) => {
    const created = await tx.cvDocument.create({
      data: {
        userId,
        title: cleanTitle(`${letterName(language)} · ${cv.title}`, letterName(language)),
        language,
        kind: "EDITABLE",
        docType: "LETTER",
        content: toStoredJson(content),
        tailorNotes: input.notes ?? undefined,
        isDefault: false,
        baseCvId: cv.id,
        versionCheckedAt: input.from === "content" ? new Date() : undefined,
      },
      select: { id: true },
    })
    // what the model wrote is a version, as for a letter to an offer
    if (input.from === "content") {
      await appendVersion(tx, { documentId: created.id, content, language, origin: "generated" })
    }
    return created
  })
  return { id: row.id, created: true }
}

/** The pair around a general CV or general letter, for the editor; null for anything else. */
export async function pairContext(userId: number, doc: CvDetail): Promise<PairContext | null> {
  if (doc.target) return null
  if (doc.docType === "CV") {
    const letter = await db.cvDocument.findFirst({
      where: { userId, baseCvId: doc.id, ...GENERAL_LETTER },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    })
    return { cvId: doc.id, letterId: letter?.id ?? null, notes: null }
  }
  if (!doc.forCvId) return null
  return { cvId: doc.forCvId, letterId: doc.id, notes: parseTailorNotes(doc.tailorNotes) }
}

/**
 * The PDF of a CV: the uploaded file, the cached render when it is still current, or a fresh
 * render (cached for next time). Null when the CV does not exist or Chrome is unavailable.
 * `leaves`: the PDF goes out of the app (a download, a form, an export), so it is kept in the
 * history (versions.ts keepPdfVersion); a preview does not pass it.
 */
export async function cvPdf(
  userId: number,
  id: string,
  opts: { leaves?: boolean } = {}
): Promise<{ bytes: Buffer; name: string } | null> {
  const row = await db.cvDocument.findFirst({ where: { id, userId } })
  if (!row) return null
  if (row.kind === "UPLOADED") {
    if (!row.pdf) return null
    const name = row.pdfName?.trim() || "CV.pdf"
    return { bytes: Buffer.from(row.pdf), name: /\.pdf$/i.test(name) ? name : `${name}.pdf` }
  }
  const content = row.content == null ? null : parseCvContent(row.content)
  if (!content) return null
  const language = cvLocale(row.language)
  const docType = row.docType === "LETTER" ? "LETTER" : "CV"
  const name = documentPdfName(content, docType, language)
  let bytes: Buffer
  if (row.pdf && row.pdfUpdatedAt && row.pdfUpdatedAt >= row.updatedAt) {
    bytes = Buffer.from(row.pdf)
  } else {
    const rendered = await contentPdf(content, docType, language)
    if (!rendered) return null
    bytes = rendered.bytes
    // only if nothing changed while Chrome ran; keep updatedAt so the cache counts as current
    await db.cvDocument.updateMany({
      where: { id: row.id, userId, updatedAt: row.updatedAt },
      data: { pdf: bytes, pdfName: name, pdfUpdatedAt: new Date(), updatedAt: row.updatedAt },
    })
  }
  if (opts.leaves) {
    // the file goes out as it is even when its history entry fails
    await keepPdfVersion({ documentId: row.id, content, language, pdf: { bytes, name } }).catch(
      (error: unknown) =>
        console.error("CV PDF version failed", error instanceof Error ? error.message : error)
    )
  }
  return { bytes, name }
}

/** A document's PDF from its content, stored nowhere: a letter written for a page outside the index. */
export async function contentPdf(
  content: CvContent,
  docType: CvDocType,
  language: CvLanguage
): Promise<{ bytes: Buffer; name: string } | null> {
  const bytes = await renderPdfFromHtml(renderCvHtml(content, { print: true, lang: language }))
  return bytes ? { bytes, name: documentPdfName(content, docType, language) } : null
}

/** Plain text of a CV, for prompts. */
export function cvText(content: CvContent): string {
  return cvPlainText(content)
}

/** The stored PDF bytes for structuring an uploaded CV, with the file's name. */
export async function storedPdf(
  userId: number,
  id: string
): Promise<{ bytes: Buffer; title: string; name: string; language: CvLanguage } | null> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { pdf: true, pdfName: true, title: true, language: true },
  })
  if (!row?.pdf) return null
  return {
    bytes: Buffer.from(row.pdf),
    title: row.title,
    name: row.pdfName?.trim() || `${row.title}.pdf`,
    language: cvLocale(row.language),
  }
}
