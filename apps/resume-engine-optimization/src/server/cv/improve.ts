import db from "db"
import { improveSection } from "@newrole/cv-engine/improve"
import type { LlmClient } from "@newrole/llm/common"
import { cvLocale } from "@newrole/cv-core/blank"
import { parseCvContent, type CvContent, type CvSection } from "@newrole/cv-core/schema"
import { isRewritable } from "@newrole/cv-core/tailor"
import type { ImproveMode, ImprovedSection } from "@newrole/cv-core/views"
import { createWritingClient } from "src/server/llm/writing"
import { candidateContext } from "src/server/profile/context"
import { CvError, getCv, type CvLanguage } from "./service"
import { appendVersion, keepCurrentState, toStoredJson } from "./versions"

/**
 * "Popraw z AI" in the CV editor: one section rewritten by the model (@newrole/cv-engine/improve),
 * shown to the person first and stored only when they apply it. Applying keeps the CV's state
 * before in its history, so it can be restored.
 */

/** The section rewritten, not stored. `llm` is injectable for tests. */
export async function improveCvSection(input: {
  userId: number
  id: string
  sectionId: string
  mode: ImproveMode
  note?: string
  /** The language of the notes for the person */
  locale?: CvLanguage
  /** 2 and up: another take, which must not come from the reply cache */
  attempt?: number
  llm?: LlmClient | null
}): Promise<ImprovedSection> {
  const { userId } = input
  const cv = await getCv(userId, input.id)
  if (!cv) throw new CvError("not-found", "CV not found.")
  const section = cv.content?.sections.find((entry) => entry.id === input.sectionId)
  if (!cv.content || cv.docType !== "CV" || !section || !isRewritable(section))
    throw new CvError("no-content", "This section cannot be rewritten.")
  const llm = input.llm === undefined ? createWritingClient() : input.llm
  if (!llm) throw new CvError("llm-unavailable", "No model is configured.")
  const improved = await improveSection({
    llm,
    cv: cv.content,
    sectionId: section.id,
    mode: input.mode,
    note: input.note,
    language: cv.language,
    locale: input.locale,
    context: await candidateContext(userId),
    attempt: input.attempt,
    userId,
  })
  if (!improved) throw new CvError("llm-failed", "The model did not return a usable section.")
  return improved
}

/**
 * Puts a rewritten section in place of the stored one with the same id: the state before is kept
 * in the history, and the result is a version of its own ("generated").
 */
export async function applyCvSection(
  userId: number,
  id: string,
  section: CvSection
): Promise<{ content: CvContent; language: CvLanguage; updatedAt: Date }> {
  return db.$transaction(async (tx) => {
    const row = await tx.cvDocument.findFirst({
      where: { id, userId, kind: "EDITABLE", docType: "CV" },
      select: { id: true, content: true, language: true },
    })
    const current = parseCvContent(row?.content)
    if (!row || !current) throw new CvError("not-found", "CV not found.")
    const at = current.sections.findIndex((entry) => entry.id === section.id)
    if (at < 0 || current.sections[at].type !== section.type)
      throw new CvError("invalid-content", "That section is not in this CV.")
    const content = parseCvContent({
      ...current,
      sections: current.sections.map((entry, index) => (index === at ? section : entry)),
    })
    if (!content) throw new CvError("invalid-content", "The section is not valid.")
    await keepCurrentState(tx, row)
    const written = await tx.cvDocument.update({
      where: { id },
      data: {
        content: toStoredJson(content),
        versionCheckedAt: new Date(),
        // the stored PDF no longer matches; cvPdf renders a new one on demand
        pdf: null,
        pdfName: null,
        pdfUpdatedAt: null,
      },
      select: { updatedAt: true },
    })
    const language = cvLocale(row.language)
    await appendVersion(tx, { documentId: id, content, language, origin: "generated" })
    return { content, language, updatedAt: written.updatedAt }
  })
}
