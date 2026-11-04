import db from "db"
import { buildProfileAudit, type AuditLocale } from "@newrole/profile/audit"
import { detectLanguage } from "@newrole/cv-core/language"
import {
  documentHash,
  parseStoredDocument,
  profileText,
  type LinkedInDocument,
} from "@newrole/profile/linkedin"
import {
  auditView,
  documentFromSections,
  parseStoredAudit,
  type LinkedInAuditBody,
  type ProfileAuditView,
} from "@newrole/profile/linkedin-audit"
import { createLlmClient } from "src/server/llm/client"
import { demandForUser } from "./audit-store"

/**
 * The LinkedIn profile the Chrome extension reads (@newrole/profile/linkedin-audit), kept for the
 * person: the parsed document replaces the stored one, and the audit runs only when the document
 * changed, so an unchanged profile costs no model call.
 */

async function latestRun(userId: number) {
  return db.profileAuditRun.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } })
}

async function storedDocument(userId: number): Promise<LinkedInDocument | null> {
  const profile = await db.candidateProfile.findUnique({
    where: { userId },
    select: { linkedinDocument: true },
  })
  return parseStoredDocument(profile?.linkedinDocument ?? null)
}

/**
 * Audits the profile the extension read. Null when the sections do not make a profile. The
 * document is stored as the person's LinkedIn profile whenever it differs from the stored one.
 */
export async function auditLinkedInProfile(
  userId: number,
  body: LinkedInAuditBody
): Promise<ProfileAuditView | null> {
  const document = documentFromSections(body.sections)
  if (!document) return null
  const locale: AuditLocale = body.locale ?? "pl"
  const hash = documentHash(document)
  const [stored, latest] = await Promise.all([storedDocument(userId), latestRun(userId)])
  if (!stored || documentHash(stored) !== hash) {
    await db.candidateProfile.upsert({
      where: { userId },
      update: { linkedinDocument: document, linkedinImportedAt: new Date() },
      create: { userId, linkedinDocument: document, linkedinImportedAt: new Date() },
    })
  }
  if (latest && latest.documentHash === hash && !body.force) {
    const previous = parseStoredAudit(latest)
    if (previous) return auditView(previous, document, latest.createdAt, false, locale)
  }
  const text = profileText(document)
  const audit = await buildProfileAudit({
    document,
    facts: await demandForUser(userId, text),
    llm: createLlmClient(),
    previousScore: latest?.score ?? null,
    userId,
    locale,
    language: detectLanguage(text),
  })
  const row = await db.profileAuditRun.create({
    data: {
      userId,
      score: audit.score,
      previousScore: audit.previousScore,
      summary: audit.summary,
      topChanges: audit.topChanges,
      annotations: audit.annotations,
      demand: audit.demand,
      documentHash: audit.documentHash,
    },
  })
  return auditView(audit, document, row.createdAt, true, locale)
}

/** The latest audit as stored, for the popup; section names only while the document matches. */
export async function latestLinkedInAudit(
  userId: number,
  locale: AuditLocale
): Promise<ProfileAuditView | null> {
  const [stored, latest] = await Promise.all([storedDocument(userId), latestRun(userId)])
  if (!latest) return null
  const audit = parseStoredAudit(latest)
  if (!audit) return null
  const document = stored && documentHash(stored) === latest.documentHash ? stored : null
  return auditView(audit, document, latest.createdAt, false, locale)
}
