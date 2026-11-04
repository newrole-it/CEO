import db from "db"
import { createLlmClient } from "src/server/llm/client"
import { demandForUser } from "src/server/profile/audit-store"
import { parseCvAudit, type CvAudit } from "@newrole/cv-core/audit"
import { letterSection, parseCvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { cvLocale } from "@newrole/cv-core/blank"
import { buildCvAudit } from "./audit"
import { CvError } from "./service"

export async function latestCvAudit(userId: number, id: string): Promise<CvAudit | null> {
  const row = await db.cvDocument.findFirst({ where: { id, userId }, select: { audit: true } })
  return row ? parseCvAudit(row.audit) : null
}

/**
 * The audit lives on the CV row and only the latest is kept. Writes keep updatedAt as it is: an
 * audit changes nothing on the page, so it must not reorder the list or invalidate the PDF.
 */
async function storeAudit(id: string, updatedAt: Date, audit: CvAudit): Promise<void> {
  await db.cvDocument.update({ where: { id }, data: { audit, updatedAt } })
}

export async function runCvAudit(
  userId: number,
  id: string,
  locale: "pl" | "en"
): Promise<CvAudit> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { content: true, language: true, audit: true, updatedAt: true },
  })
  if (!row) throw new CvError("not-found", "CV not found.")
  const content = row.content == null ? null : parseCvContent(row.content)
  if (!content || letterSection(content)) {
    throw new CvError("no-content", "This document has no editable CV to audit.")
  }
  const previous = parseCvAudit(row.audit)
  const audit = await buildCvAudit({
    content,
    language: cvLocale(row.language),
    locale,
    facts: await demandForUser(userId, cvPlainText(content)),
    llm: createLlmClient(),
    previousScore: previous?.score ?? null,
    dismissed: previous?.dismissed,
    userId,
  })
  await storeAudit(id, row.updatedAt, audit)
  return audit
}

/** Sets which notes of the latest audit are skipped. Returns the audit as stored. */
export async function setCvAuditDismissed(
  userId: number,
  id: string,
  dismissed: string[]
): Promise<CvAudit> {
  const row = await db.cvDocument.findFirst({
    where: { id, userId },
    select: { audit: true, updatedAt: true },
  })
  const audit = row ? parseCvAudit(row.audit) : null
  if (!row || !audit) throw new CvError("not-found", "CV audit not found.")
  const ids = new Set(audit.notes.map((note) => note.id))
  const next = { ...audit, dismissed: dismissed.filter((noteId) => ids.has(noteId)) }
  await storeAudit(id, row.updatedAt, next)
  return next
}
