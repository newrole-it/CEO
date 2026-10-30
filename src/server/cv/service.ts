import db from "db"
import { parseApplicant } from "src/shared/applicant"
import { blankCv } from "src/shared/cv/blank"
import { cvFromProfile } from "src/shared/cv/from-profile"
import { cvPdfFileName } from "src/shared/cv/filename"
import { cvContentError, parseCvContent, type CvContent } from "src/shared/cv/schema"
import { cvPlainText } from "src/shared/cv/text"
import { parseStoredDocument } from "src/server/profile/linkedin"
import { asStringList } from "src/server/profile/schema"
import { renderCvHtml, renderPdfFromHtml } from "./render"

/** CV documents: the person's editable CVs and uploaded PDFs (docs/product/plan-aplikacje.md §5.2). */

export { cvPdfFileName }

export const MAX_CV_PDF_BYTES = 5_000_000
const MAX_TITLE = 160

export type CvLanguage = "pl" | "en"
export type CvKind = "EDITABLE" | "UPLOADED"

export type CvView = {
  id: string
  title: string
  language: CvLanguage
  kind: CvKind
  isDefault: boolean
  /** A PDF is stored: the uploaded one, or the last render of an editable CV */
  hasPdf: boolean
  hasContent: boolean
  updatedAt: Date
}

export type CvDetail = CvView & { content: CvContent | null }

export type CvErrorCode =
  | "not-found"
  | "invalid-content"
  | "not-pdf"
  | "too-large"
  | "uploaded-readonly"
  | "no-content"

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
  isDefault: true,
  pdfUpdatedAt: true,
  updatedAt: true,
} as const
const DETAIL_FIELDS = { ...VIEW_FIELDS, content: true } as const

type ViewRow = {
  id: string
  title: string
  language: string
  kind: string
  isDefault: boolean
  pdfUpdatedAt: Date | null
  updatedAt: Date
  content?: unknown
}

function language(value: string | null | undefined): CvLanguage {
  return value === "en" ? "en" : "pl"
}

function toView(row: ViewRow, hasContent: boolean): CvView {
  return {
    id: row.id,
    title: row.title,
    language: language(row.language),
    kind: row.kind === "UPLOADED" ? "UPLOADED" : "EDITABLE",
    isDefault: row.isDefault,
    hasPdf: Boolean(row.pdfUpdatedAt),
    hasContent,
    updatedAt: row.updatedAt,
  }
}

function toDetail(row: ViewRow): CvDetail {
  const content = row.content == null ? null : parseCvContent(row.content)
  return { ...toView(row, Boolean(content)), content }
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

/** A stored JSON value: drops the undefined keys optional fields can leave behind. */
function toJson(content: CvContent) {
  return JSON.parse(JSON.stringify(content))
}

/** Leaves the content out, so a list never loads photos; an editable row always has content. */
export async function listCvs(userId: number): Promise<CvView[]> {
  const rows = await db.cvDocument.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
    select: VIEW_FIELDS,
  })
  return rows.map((row) => toView(row, row.kind !== "UPLOADED"))
}

export async function getCv(userId: number, id: string): Promise<CvDetail | null> {
  const row = await db.cvDocument.findFirst({ where: { id, userId }, select: DETAIL_FIELDS })
  return row ? toDetail(row) : null
}

/** The default CV, else the newest one (older data may have none marked). */
export async function defaultCv(userId: number): Promise<CvDetail | null> {
  const row = await db.cvDocument.findFirst({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
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

export async function createCv(input: {
  userId: number
  title?: string
  language?: CvLanguage
  from: "blank" | "profile" | "content"
  content?: CvContent
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
    const existing = await tx.cvDocument.count({ where: { userId: input.userId } })
    return tx.cvDocument.create({
      data: {
        userId: input.userId,
        title: cleanTitle(input.title, fallback),
        language: lang,
        kind: "EDITABLE",
        content: toJson(content),
        isDefault: existing === 0,
      },
      select: DETAIL_FIELDS,
    })
  })
  return toDetail(row)
}

export async function updateCv(
  userId: number,
  id: string,
  patch: { title?: string; language?: CvLanguage; content?: CvContent }
): Promise<CvDetail> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { id: true, kind: true, title: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  const data: {
    title?: string
    language?: string
    content?: object
    pdf?: null
    pdfName?: null
    pdfUpdatedAt?: null
  } = {}
  if (patch.title !== undefined) data.title = cleanTitle(patch.title, row.title)
  if (patch.language !== undefined) data.language = language(patch.language)
  if (patch.content !== undefined) {
    if (row.kind === "UPLOADED") {
      throw new CvError(
        "uploaded-readonly",
        "An uploaded PDF cannot be edited. Create an editable copy first."
      )
    }
    data.content = toJson(validContent(patch.content))
    // the stored PDF no longer matches; cvPdf renders a new one on demand
    data.pdf = null
    data.pdfName = null
    data.pdfUpdatedAt = null
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
    const existing = await tx.cvDocument.count({ where: { userId: input.userId } })
    return tx.cvDocument.create({
      data: {
        userId: input.userId,
        title: cleanTitle(input.title, fileName.replace(/\.pdf$/i, "")),
        language: language(input.language),
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

export async function duplicateCv(userId: number, id: string): Promise<CvDetail> {
  const row = await db.cvDocument.findFirst({ where: { id, userId } })
  if (!row) throw new CvError("not-found", "CV not found.")
  const uploaded = row.kind === "UPLOADED"
  const suffix = language(row.language) === "en" ? " (copy)" : " (kopia)"
  const created = await db.cvDocument.create({
    data: {
      userId,
      title: `${row.title.slice(0, MAX_TITLE - suffix.length)}${suffix}`,
      language: row.language,
      kind: row.kind,
      content: row.content ?? undefined,
      // a rendered PDF is only a cache; the copy renders its own
      pdf: uploaded ? row.pdf : null,
      pdfName: uploaded ? row.pdfName : null,
      pdfUpdatedAt: uploaded ? new Date() : null,
      isDefault: false,
    },
    select: DETAIL_FIELDS,
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
  const row = await db.cvDocument.findFirst({ where: { id, userId }, select: { id: true } })
  if (!row) throw new CvError("not-found", "CV not found.")
  await markDefault(userId, id)
}

export async function deleteCv(userId: number, id: string): Promise<void> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { id: true, isDefault: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  await db.cvDocument.delete({ where: { id: row.id } })
  if (!row.isDefault) return
  const next = await db.cvDocument.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  })
  if (next) await markDefault(userId, next.id)
}

/**
 * The PDF of a CV: the uploaded file, the cached render when it is still current, or a fresh
 * render (cached for next time). Null when the CV does not exist or Chrome is unavailable.
 */
export async function cvPdf(
  userId: number,
  id: string
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
  const name = cvPdfFileName(content.header.name)
  if (row.pdf && row.pdfUpdatedAt && row.pdfUpdatedAt >= row.updatedAt) {
    return { bytes: Buffer.from(row.pdf), name }
  }
  const bytes = await renderPdfFromHtml(
    renderCvHtml(content, { print: true, lang: language(row.language) })
  )
  if (!bytes) return null
  // only if nothing changed while Chrome ran; keep updatedAt so the cache counts as current
  await db.cvDocument.updateMany({
    where: { id: row.id, userId, updatedAt: row.updatedAt },
    data: { pdf: bytes, pdfName: name, pdfUpdatedAt: new Date(), updatedAt: row.updatedAt },
  })
  return { bytes, name }
}

/** Plain text of a CV, for prompts. */
export function cvText(content: CvContent): string {
  return cvPlainText(content)
}

/** The stored PDF bytes for structuring an uploaded CV. */
export async function storedPdf(
  userId: number,
  id: string
): Promise<{ bytes: Buffer; title: string; language: CvLanguage } | null> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { pdf: true, title: true, language: true },
  })
  if (!row?.pdf) return null
  return { bytes: Buffer.from(row.pdf), title: row.title, language: language(row.language) }
}
