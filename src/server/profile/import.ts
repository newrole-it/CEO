import db from "db"
import { createLlmClient } from "src/server/llm/client"
import { extractProfileFromText } from "@newrole/profile/extract"
import { parseLinkedInProfile } from "@newrole/profile/linkedin"
import type { ProfileDraft } from "@newrole/profile/schema"

/**
 * CV text → profile draft for the review step. The parsed LinkedIn sections are kept for "CV from
 * profile" when there is a session. The draft itself is saved only when the person confirms it
 * (saveProfile).
 */
export async function draftFromProfileText(
  text: string,
  userId?: number
): Promise<{ draft: ProfileDraft }> {
  const draft = await extractProfileFromText(text, createLlmClient(), userId)
  const document = parseLinkedInProfile(text)
  try {
    if (userId && document) {
      await db.candidateProfile.upsert({
        where: { userId },
        update: { linkedinDocument: document, linkedinImportedAt: new Date() },
        create: { userId, linkedinDocument: document, linkedinImportedAt: new Date() },
      })
    }
  } catch (error) {
    console.error("profile import persist failed", error instanceof Error ? error.message : error)
  }
  return { draft }
}
