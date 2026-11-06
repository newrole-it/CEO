import db from "db"
import { detectLanguage } from "@newrole/cv-core/language"
import { parseCvContent } from "@newrole/cv-core/schema"
import type { LlmClient } from "@newrole/llm/common"
import { extractPdfText } from "@newrole/profile/pdf"
import { structureCvText } from "@newrole/cv-engine/structure"
import { createLlmClient } from "src/server/llm/client"
import { CvError, getCv, storedPdf, type CvDetail } from "./service"
import { appendOriginal, toStoredJson } from "./versions"

/**
 * An uploaded PDF and its editable version are one CV: "Utwórz wersję do edycji" turns the same
 * document editable, and the file stays as its version 0 (versions.ts appendOriginal).
 */

/**
 * "Utwórz wersję do edycji": reads the uploaded PDF into content on the same document. From then
 * on its PDF is made from that content; the uploaded file stays in the history. A CV already
 * editable comes back as it is, and a PDF that still has an editable copy from before is merged
 * with it (mergeUploadedCopies) rather than read again: the CV that comes back is that copy.
 * `llm` is injectable for tests; null reads by rules.
 */
export async function createEditableFromUpload(
  userId: number,
  id: string,
  llm: LlmClient | null = createLlmClient()
): Promise<{ cv: CvDetail; reader: "llm" | "text" }> {
  const current = await getCv(userId, id)
  if (!current) throw new CvError("not-found", "CV not found.")
  if (current.content) return { cv: current, reader: "text" }
  const copy = await mergeOne(id)
  if (copy) {
    const merged = await getCv(userId, copy)
    if (merged) return { cv: merged, reader: "text" }
  }
  const stored = await storedPdf(userId, id)
  if (!stored) throw new CvError("not-found", "CV not found.")
  let text = ""
  try {
    text = await extractPdfText(stored.bytes)
  } catch (error) {
    console.error("cv pdf text failed", error instanceof Error ? error.message : error)
  }
  if (text.trim().length < 20)
    throw new CvError("no-content", "No text could be read from that PDF.")
  // an upload takes the language of the interface, so an English CV can be stored as Polish;
  // the content follows its text, or it would get Polish labels and a Polish consent clause
  const language = detectLanguage(text)
  const { content, reader } = await structureCvText({ text, locale: language, userId, llm })
  await db.$transaction(async (tx) => {
    // only while it is still the upload: a second click that raced this one changes nothing
    const turned = await tx.cvDocument.updateMany({
      where: { id, userId, kind: "UPLOADED" },
      data: {
        kind: "EDITABLE",
        language,
        content: toStoredJson(content),
        // the file moves to version 0; this field caches the PDF made from the content
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
        versionCheckedAt: new Date(),
      },
    })
    if (turned.count === 0) return
    await appendOriginal(tx, {
      documentId: id,
      content,
      language,
      pdf: stored.bytes,
      name: stored.name,
    })
  })
  const cv = await getCv(userId, id)
  if (!cv) throw new CvError("not-found", "CV not found.")
  return { cv, reader }
}

/**
 * Before an uploaded PDF and its editable version were one CV, "Utwórz edytowalną wersję" made a
 * second CV next to the PDF. This folds each such pair into one: the PDF becomes the editable
 * CV's version 0, and the PDF's place as the default, its applications, its letter and its title
 * move to the editable one; then the PDF's own row goes. When a PDF has several editable copies,
 * the newest takes it and the others stay CVs of their own. Runs at every start and does nothing
 * once no pair is left; returns how many it merged.
 */
export async function mergeUploadedCopies(userId?: number): Promise<number> {
  const uploads = await db.cvDocument.findMany({
    where: {
      ...(userId === undefined ? {} : { userId }),
      kind: "UPLOADED",
      docType: "CV",
      targetCompany: null,
      tailored: { some: { kind: "EDITABLE", docType: "CV", targetCompany: null } },
    },
    select: { id: true },
  })
  let merged = 0
  for (const { id } of uploads) {
    try {
      if (await mergeOne(id)) merged += 1
    } catch (error) {
      console.error("merging an uploaded CV failed", error instanceof Error ? error.message : error)
    }
  }
  return merged
}

/** Folds one uploaded PDF into its newest editable copy; the copy's id, or null when there is none. */
async function mergeOne(uploadId: string): Promise<string | null> {
  return db.$transaction(async (tx) => {
    const upload = await tx.cvDocument.findFirst({
      where: { id: uploadId, kind: "UPLOADED" },
      select: { id: true, userId: true, title: true, isDefault: true, pdf: true, pdfName: true },
    })
    if (!upload?.pdf) return null
    const copies = await tx.cvDocument.findMany({
      where: { baseCvId: upload.id, kind: "EDITABLE", docType: "CV", targetCompany: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, content: true, language: true, isDefault: true, updatedAt: true },
    })
    const copy = copies[0]
    if (!copy) return null
    // version 0 is what was read from the PDF: the copy's first version, else its content, which
    // was never edited (the first edit keeps the state before it)
    const first = await tx.cvVersion.findFirst({
      where: { documentId: copy.id },
      orderBy: { number: "asc" },
      select: { number: true, content: true, language: true },
    })
    const content = parseCvContent(first?.content ?? copy.content)
    if (!content || first?.number === 0) return null
    await appendOriginal(tx, {
      documentId: copy.id,
      content,
      language: first?.language ?? copy.language,
      pdf: upload.pdf,
      name: upload.pdfName?.trim() || `${upload.title}.pdf`,
    })
    await tx.application.updateMany({
      where: { cvDocumentId: upload.id },
      data: { cvDocumentId: copy.id },
    })
    // the other copies become CVs of their own; letters and CVs for offers follow the merged one
    await tx.cvDocument.updateMany({
      where: { id: { in: copies.slice(1).map((other) => other.id) } },
      data: { baseCvId: null },
    })
    await tx.cvDocument.updateMany({
      where: { baseCvId: upload.id, id: { not: copy.id } },
      data: { baseCvId: copy.id },
    })
    await tx.cvDocument.update({
      where: { id: copy.id },
      data: {
        title: upload.title,
        isDefault: copy.isDefault || upload.isDefault,
        baseCvId: null,
        // the merge changes nothing the person wrote: the CV keeps its place in lists
        updatedAt: copy.updatedAt,
      },
      select: { id: true },
    })
    await tx.cvDocument.delete({ where: { id: upload.id } })
    return copy.id
  })
}
