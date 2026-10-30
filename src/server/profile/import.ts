import db from "db"
import { createLlmClient } from "src/server/llm/client"
import { runProfileAuditForUser } from "./audit-store"
import { extractProfileFromText } from "./extract"
import { parseLinkedInProfile } from "./linkedin"
import type { ProfileDraft } from "./schema"

/**
 * CV text → profile draft for the review step. The parsed LinkedIn sections are kept for
 * Profile audit when there is a session. The draft itself is saved only when the person
 * confirms it (saveProfile).
 */
export async function draftFromProfileText(
  text: string,
  userId?: number
): Promise<{ draft: ProfileDraft; audited: boolean }> {
  const draft = await extractProfileFromText(text, createLlmClient(), userId)
  const document = parseLinkedInProfile(text)
  let audited = false
  try {
    if (userId && document) {
      await db.candidateProfile.upsert({
        where: { userId },
        update: { linkedinDocument: document, linkedinImportedAt: new Date() },
        create: { userId, linkedinDocument: document, linkedinImportedAt: new Date() },
      })
      await runProfileAuditForUser(userId)
      audited = true
    }
  } catch (error) {
    console.error("profile import persist failed", error instanceof Error ? error.message : error)
  }
  return { draft, audited }
}
