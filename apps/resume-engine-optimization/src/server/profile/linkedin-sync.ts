import db from "db"
import { detectLanguage } from "@newrole/cv-core/language"
import {
  compareWithLinkedIn,
  writeLinkedInTexts,
  type LinkedInComparison,
  type LinkedInTexts,
} from "@newrole/cv-engine/linkedin-sync"
import type { LlmClient } from "@newrole/llm/common"
import { documentHash, parseStoredDocument, profileText } from "@newrole/profile/linkedin"
import { CvError, defaultCv, type CvLanguage } from "src/server/cv/service"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "./context"

/**
 * "LinkedIn i CV" (/profile/linkedin): the person's default CV against the LinkedIn profile they
 * keep here (read by the Chrome extension or imported), and texts for LinkedIn written from the
 * CV (@newrole/cv-engine/linkedin-sync). Nothing is stored and nothing goes to LinkedIn.
 */

export type LinkedInSyncView = {
  cv: { id: string; title: string; language: CvLanguage } | null
  /** When the LinkedIn profile was last read or imported; null when there is none */
  readAt: Date | null
  /**
   * extension: the Chrome extension read it from the person's own LinkedIn page (it matches the
   * extension's last audit). import: an import, which may have been LinkedIn or a CV.
   */
  source: "extension" | "import" | null
  comparison: LinkedInComparison | null
  /** The language the texts are written in: the LinkedIn profile's, else the CV's */
  language: CvLanguage
}

async function linkedInOf(userId: number) {
  const [profile, audit] = await Promise.all([
    db.candidateProfile.findUnique({
      where: { userId },
      select: { linkedinDocument: true, linkedinImportedAt: true },
    }),
    db.profileAuditRun.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: { documentHash: true },
    }),
  ])
  const document = parseStoredDocument(profile?.linkedinDocument ?? null)
  const source: LinkedInSyncView["source"] = !document
    ? null
    : audit?.documentHash === documentHash(document)
      ? "extension"
      : "import"
  return { document, source, readAt: document ? (profile?.linkedinImportedAt ?? null) : null }
}

export async function linkedInSyncView(userId: number): Promise<LinkedInSyncView> {
  const [cv, linkedIn] = await Promise.all([defaultCv(userId), linkedInOf(userId)])
  const content = cv?.content ?? null
  const language = linkedIn.document
    ? detectLanguage(profileText(linkedIn.document))
    : (cv?.language ?? "pl")
  return {
    cv: cv && content ? { id: cv.id, title: cv.title, language: cv.language } : null,
    readAt: linkedIn.readAt,
    source: linkedIn.source,
    comparison:
      content && linkedIn.document ? compareWithLinkedIn(content, linkedIn.document) : null,
    language,
  }
}

/** Texts for LinkedIn from the default CV. Throws a CvError: no CV, no model, or nothing usable. */
export async function linkedInTextsFor(input: {
  userId: number
  language?: CvLanguage
  llm?: LlmClient | null
}): Promise<LinkedInTexts> {
  const { userId } = input
  const llm = input.llm === undefined ? createWritingClient() : input.llm
  if (!llm) throw new CvError("llm-unavailable", "No model is configured.")
  const [cv, linkedIn, context] = await Promise.all([
    defaultCv(userId),
    linkedInOf(userId),
    candidateContext(userId),
  ])
  if (!cv?.content) throw new CvError("no-content", "There is no CV with content to write from.")
  const current = linkedIn.document ? profileText(linkedIn.document) : undefined
  const texts = await writeLinkedInTexts({
    llm,
    cv: cv.content,
    context,
    language: input.language ?? (current ? detectLanguage(current) : cv.language),
    current,
    userId,
  })
  if (!texts) throw new CvError("llm-failed", "The model did not return usable texts.")
  return texts
}
