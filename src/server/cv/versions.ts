import { createHash } from "crypto"
import type { Prisma } from "@prisma/client"
import db from "db"
import { cvLocale } from "src/shared/cv/blank"
import { parseCvContent, type CvContent } from "src/shared/cv/schema"

/**
 * Version history of an editable CV or letter. A version is a whole copy of the content; nothing
 * ever rewrites one, and restoring adds a new version on top, like a revert.
 *
 * Autosave runs every few seconds, so it does not make versions. While someone edits, the state
 * before an edit is kept at most once per AUTO_VERSION_MS, which also covers the first edit of a
 * new session. Automatic versions are capped; the ones the person named or a model wrote are not.
 */

export const AUTO_VERSION_MS = 10 * 60_000
export const MAX_AUTO_VERSIONS = 30
const MAX_LABEL = 120
const LOCK_NAMESPACE = 7419

export type CvVersionOrigin = "auto" | "manual" | "base" | "generated" | "restored"

export type CvVersionView = {
  id: string
  number: number
  origin: CvVersionOrigin
  label: string | null
  sourceNumber: number | null
  language: "pl" | "en"
  createdAt: Date
  /** The document is exactly this version right now */
  isCurrent: boolean
}

type Writer = Prisma.TransactionClient

const VIEW_FIELDS = {
  id: true,
  number: true,
  origin: true,
  label: true,
  sourceNumber: true,
  language: true,
  contentHash: true,
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
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`
  if (value && typeof value === "object") {
    const fields = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, field]) => `${JSON.stringify(key)}:${canonical(field)}`)
    return `{${fields.join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

/** Stable across key order: Postgres stores JSON with its keys reordered. */
export function contentHash(content: CvContent): string {
  return createHash("sha256").update(canonical(content)).digest("hex")
}

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
  }
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${LOCK_NAMESPACE}::int, hashtext(${input.documentId}))`
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
    },
    select: VIEW_FIELDS,
  })
  if (input.origin === "auto") await pruneAuto(tx, input.documentId)
  return row
}

async function pruneAuto(tx: Writer, documentId: string) {
  const extra = await tx.cvVersion.findMany({
    where: { documentId, origin: "auto" },
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
      const row = name
        ? await tx.cvVersion.update({
            where: { id: latest.id },
            data: { label: name, origin: latest.origin === "auto" ? "manual" : latest.origin },
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
): Promise<{ content: CvContent; language: "pl" | "en"; version: CvVersionView } | null> {
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
  const row = await db.$transaction(async (tx) => {
    await keepCurrentState(tx, document)
    await tx.cvDocument.update({
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
      select: { id: true },
    })
    return appendVersion(tx, {
      documentId: id,
      content,
      language,
      origin: "restored",
      sourceNumber: target.number,
    })
  })
  return { content, language, version: toView(row, row.contentHash) }
}
