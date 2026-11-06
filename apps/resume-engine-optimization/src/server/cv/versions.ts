import type { Prisma } from "@prisma/client"
import db from "db"
import { contentHash } from "@newrole/cv-engine/versions"
import type { CvVersionOrigin, CvVersionView } from "@newrole/cv-core/views"
import { cvLocale } from "@newrole/cv-core/blank"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"

/**
 * Version history of an editable CV or letter. A version is a whole copy of the content; nothing
 * ever rewrites one, and restoring adds a new version on top, like a revert.
 *
 * Autosave runs every few seconds, so it does not make versions. While someone edits, the state
 * before an edit is kept at most once per AUTO_VERSION_MS, which also covers the first edit of a
 * new session. Automatic versions are capped; the ones the person named or a model wrote are not,
 * and neither is one that keeps a PDF.
 *
 * PDFs: a CV uploaded as a PDF keeps that file as version 0 ("upload"). Every PDF made from a
 * document that leaves the app (downloaded, attached to a form by the extension, exported by
 * Claude) stays with the version it was made from, so the history shows what was sent.
 */

export const AUTO_VERSION_MS = 10 * 60_000
export const MAX_AUTO_VERSIONS = 30
const MAX_LABEL = 120
const LOCK_NAMESPACE = 7419

export type { CvVersionOrigin, CvVersionView }

type Writer = Prisma.TransactionClient

const VIEW_FIELDS = {
  id: true,
  number: true,
  origin: true,
  label: true,
  sourceNumber: true,
  language: true,
  contentHash: true,
  pdfName: true,
  createdAt: true,
} as const

type VersionRow = {
  id: string
  number: number
  origin: string
  label: string | null
  sourceNumber: number | null
  language: string
  contentHash: string
  pdfName: string | null
  createdAt: Date
}

function toView(row: VersionRow, currentHash: string | null): CvVersionView {
  return {
    id: row.id,
    number: row.number,
    origin: row.origin as CvVersionOrigin,
    label: row.label,
    sourceNumber: row.sourceNumber,
    language: cvLocale(row.language),
    createdAt: row.createdAt,
    isCurrent: row.contentHash === currentHash,
    hasPdf: row.pdfName !== null,
  }
}

export { contentHash }

/** A stored JSON value: drops the undefined keys optional fields can leave behind. */
export function toStoredJson(content: CvContent) {
  return JSON.parse(JSON.stringify(content))
}

function cleanLabel(label: string | null | undefined): string | null {
  return (label ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_LABEL) || null
}

/** Adds the next version. Numbers come under a lock, so two writers cannot take the same one. */
export async function appendVersion(
  tx: Writer,
  input: {
    documentId: string
    content: CvContent
    language: string
    origin: CvVersionOrigin
    label?: string | null
    sourceNumber?: number | null
    /** The PDF this version left the app as */
    pdf?: { bytes: Uint8Array; name: string } | null
  }
) {
  await lockDocument(tx, input.documentId)
  const last = await tx.cvVersion.aggregate({
    where: { documentId: input.documentId },
    _max: { number: true },
  })
  const row = await tx.cvVersion.create({
    data: {
      documentId: input.documentId,
      number: (last._max.number ?? 0) + 1,
      origin: input.origin,
      label: cleanLabel(input.label),
      sourceNumber: input.sourceNumber ?? null,
      language: input.language,
      content: toStoredJson(input.content),
      contentHash: contentHash(input.content),
      pdf: input.pdf ? Buffer.from(input.pdf.bytes) : null,
      pdfName: input.pdf?.name ?? null,
    },
    select: VIEW_FIELDS,
  })
  if (input.origin === "auto") await pruneAuto(tx, input.documentId)
  return row
}

/** One writer of a document's versions at a time: numbers and the newest version stay consistent. */
async function lockDocument(tx: Writer, documentId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${documentId}))`
}

/**
 * Version 0: the PDF a CV was uploaded as, with the content read from it. It is never pruned or
 * rewritten, so the original file stays as long as the CV does.
 */
export async function appendOriginal(
  tx: Writer,
  input: { documentId: string; content: CvContent; language: string; pdf: Uint8Array; name: string }
) {
  await lockDocument(tx, input.documentId)
  return tx.cvVersion.create({
    data: {
      documentId: input.documentId,
      number: 0,
      origin: "upload",
      language: input.language,
      content: toStoredJson(input.content),
      contentHash: contentHash(input.content),
      pdf: Buffer.from(input.pdf),
      pdfName: input.name,
    },
    select: VIEW_FIELDS,
  })
}

/**
 * A PDF that left the app stays in the history: on the newest version when that is the same
 * content and keeps no PDF yet, else as a new version. Making the same PDF again adds nothing.
 * The uploaded original never takes another file: a PDF made from its content is a version of
 * its own.
 */
export async function keepPdfVersion(input: {
  documentId: string
  content: CvContent
  language: string
  pdf: { bytes: Uint8Array; name: string }
}): Promise<void> {
  const hash = contentHash(input.content)
  await db.$transaction(async (tx) => {
    await lockDocument(tx, input.documentId)
    const latest = await tx.cvVersion.findFirst({
      where: { documentId: input.documentId },
      orderBy: { number: "desc" },
      select: { id: true, origin: true, contentHash: true, pdfName: true },
    })
    if (latest && latest.contentHash === hash && latest.origin !== "upload") {
      if (latest.pdfName !== null) return
      await tx.cvVersion.update({
        where: { id: latest.id },
        data: { pdf: Buffer.from(input.pdf.bytes), pdfName: input.pdf.name },
        select: { id: true },
      })
      return
    }
    await appendVersion(tx, {
      documentId: input.documentId,
      content: input.content,
      language: input.language,
      origin: "pdf",
      pdf: input.pdf,
    })
  })
}

/** The PDF a version keeps; null when it keeps none or is not this person's. */
export async function versionPdf(
  userId: number,
  id: string,
  versionId: string
): Promise<{ bytes: Buffer; name: string } | null> {
  const row = await db.cvVersion.findFirst({
    where: { id: versionId, documentId: id, document: { userId } },
    select: { pdf: true, pdfName: true },
  })
  if (!row?.pdf || !row.pdfName) return null
  return { bytes: Buffer.from(row.pdf), name: row.pdfName }
}

async function pruneAuto(tx: Writer, documentId: string) {
  // a version that keeps a PDF stays: it is what left the app
  const extra = await tx.cvVersion.findMany({
    where: { documentId, origin: "auto", pdfName: null },
    orderBy: { number: "desc" },
    skip: MAX_AUTO_VERSIONS,
    select: { id: true },
  })
  if (extra.length) {
    await tx.cvVersion.deleteMany({ where: { id: { in: extra.map((row) => row.id) } } })
  }
}

/** Keeps the document's current state, unless the newest version already has it. */
export async function keepCurrentState(
  tx: Writer,
  document: { id: string; content: unknown; language: string }
) {
  const content = parseCvContent(document.content)
  if (!content) return
  const latest = await tx.cvVersion.findFirst({
    where: { documentId: document.id },
    orderBy: { number: "desc" },
    select: { contentHash: true },
  })
  if (latest?.contentHash === contentHash(content)) return
  await appendVersion(tx, {
    documentId: document.id,
    content,
    language: document.language,
    origin: "auto",
  })
}

/**
 * The automatic version an edit may take, before it is written. A failure is logged and swallowed:
 * losing one snapshot is better than a CV that refuses to save.
 */
export async function versionBeforeEdit(
  document: { id: string; content: unknown; language: string; versionCheckedAt: Date | null },
  next: CvContent,
  now = new Date()
): Promise<{ checkedAt: Date } | null> {
  const checked = document.versionCheckedAt?.getTime() ?? 0
  if (now.getTime() - checked < AUTO_VERSION_MS) return null
  try {
    const current = parseCvContent(document.content)
    if (current && contentHash(current) !== contentHash(next)) {
      await db.$transaction((tx) => keepCurrentState(tx, document))
    }
  } catch (error) {
    console.error("CV version failed", error instanceof Error ? error.message : error)
  }
  return { checkedAt: now }
}

async function ownedDocument(userId: number, id: string) {
  return db.cvDocument.findFirst({
    where: { id, userId },
    select: { id: true, content: true, language: true, updatedAt: true },
  })
}

function hashOf(content: unknown): string | null {
  const parsed = parseCvContent(content)
  return parsed ? contentHash(parsed) : null
}

/** Newest first, without the content. Empty for an uploaded PDF. */
export async function listVersions(userId: number, id: string): Promise<CvVersionView[]> {
  const document = await ownedDocument(userId, id)
  if (!document) return []
  const rows = await db.cvVersion.findMany({
    where: { documentId: id },
    orderBy: { number: "desc" },
    select: VIEW_FIELDS,
  })
  const current = hashOf(document.content)
  return rows.map((row) => toView(row, current))
}

export async function getVersion(
  userId: number,
  id: string,
  versionId: string
): Promise<(CvVersionView & { content: CvContent }) | null> {
  const row = await db.cvVersion.findFirst({
    where: { id: versionId, documentId: id, document: { userId } },
    select: { ...VIEW_FIELDS, content: true, document: { select: { content: true } } },
  })
  const content = parseCvContent(row?.content)
  if (!row || !content) return null
  return { ...toView(row, hashOf(row.document.content)), content }
}

/**
 * "Zapisz wersję": a named version of what is stored now. When nothing changed since the newest
 * version, that one takes the name instead of a copy being made. Null when there is no such
 * editable document.
 */
export async function saveVersion(
  userId: number,
  id: string,
  label?: string | null
): Promise<{ version: CvVersionView; created: boolean } | null> {
  const document = await ownedDocument(userId, id)
  const content = parseCvContent(document?.content)
  if (!document || !content) return null
  const hash = contentHash(content)
  return db.$transaction(async (tx) => {
    const latest = await tx.cvVersion.findFirst({
      where: { documentId: id },
      orderBy: { number: "desc" },
      select: VIEW_FIELDS,
    })
    // naming a version changes nothing in the document: it keeps its place in lists and its PDF
    await tx.cvDocument.update({
      where: { id },
      data: { versionCheckedAt: new Date(), updatedAt: document.updatedAt },
      select: { id: true },
    })
    const name = cleanLabel(label)
    if (latest?.contentHash === hash) {
      // the person's name replaces what an automatic or an offer's version was called
      const renamed = latest.origin === "auto" || latest.origin === "offer"
      const row = name
        ? await tx.cvVersion.update({
            where: { id: latest.id },
            data: { label: name, origin: renamed ? "manual" : latest.origin },
            select: VIEW_FIELDS,
          })
        : latest
      return { version: toView(row, hash), created: false }
    }
    const row = await appendVersion(tx, {
      documentId: id,
      content,
      language: document.language,
      origin: "manual",
      label: name,
    })
    return { version: toView(row, hash), created: true }
  })
}

/**
 * Puts a version's content back: the current state is kept first, then the restored content
 * becomes the newest version. Null when there is no such version.
 */
export async function restoreVersion(
  userId: number,
  id: string,
  versionId: string
): Promise<{
  content: CvContent
  language: "pl" | "en"
  version: CvVersionView
  /** The document's new updatedAt, for the editor's next save (updateCv baseUpdatedAt) */
  updatedAt: Date
} | null> {
  const [document, target] = await Promise.all([
    ownedDocument(userId, id),
    db.cvVersion.findFirst({
      where: { id: versionId, documentId: id },
      select: { number: true, content: true, language: true },
    }),
  ])
  const content = parseCvContent(target?.content)
  if (!document || !target || !content) return null
  const language = cvLocale(target.language)
  const { row, updatedAt } = await db.$transaction(async (tx) => {
    await keepCurrentState(tx, document)
    const written = await tx.cvDocument.update({
      where: { id },
      data: {
        content: toStoredJson(content),
        language,
        versionCheckedAt: new Date(),
        // the stored PDF no longer matches; cvPdf renders a new one on demand
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
      },
      select: { updatedAt: true },
    })
    const row = await appendVersion(tx, {
      documentId: id,
      content,
      language,
      origin: "restored",
      sourceNumber: target.number,
    })
    return { row, updatedAt: written.updatedAt }
  })
  return { content, language, version: toView(row, row.contentHash), updatedAt }
}
