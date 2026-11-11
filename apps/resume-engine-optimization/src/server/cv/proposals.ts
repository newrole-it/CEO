import db from "db"
import { cvLocale } from "@newrole/cv-core/blank"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"
import { applyProposal, parseTailorNotes, type TailorNotes } from "@newrole/cv-core/tailor"
import { CvError, type CvLanguage } from "./service"
import { appendVersion, keepCurrentState, toStoredJson } from "./versions"

/**
 * The person's answer to an addition tailoring proposed (TailorNotes.proposals). "add" puts it in
 * the stored CV, keeping the state before in the history, as applying "Popraw z AI" does; "skip"
 * only drops it from the notes, and updatedAt stays, as for an audit.
 */
export async function answerTailorProposal(
  userId: number,
  id: string,
  proposalId: string,
  answer: "add" | "skip"
): Promise<{
  notes: TailorNotes
  /** Set when the CV changed */
  cv: { content: CvContent; language: CvLanguage; updatedAt: Date } | null
}> {
  return db.$transaction(async (tx) => {
    const row = await tx.cvDocument.findFirst({
      where: { id, userId, kind: "EDITABLE", docType: "CV" },
      select: { id: true, content: true, language: true, tailorNotes: true, updatedAt: true },
    })
    const notes = parseTailorNotes(row?.tailorNotes)
    const proposal = notes?.proposals?.find((entry) => entry.id === proposalId)
    if (!row || !notes || !proposal) throw new CvError("not-found", "Proposal not found.")
    const next: TailorNotes = {
      ...notes,
      proposals: notes.proposals?.filter((entry) => entry.id !== proposalId),
    }
    if (answer === "skip") {
      await tx.cvDocument.update({
        where: { id },
        data: { tailorNotes: next, updatedAt: row.updatedAt },
        select: { id: true },
      })
      return { notes: next, cv: null }
    }
    const current = parseCvContent(row.content)
    const content = current && applyProposal(current, proposal)
    if (!content) throw new CvError("invalid-content", "The proposal no longer fits this CV.")
    await keepCurrentState(tx, row)
    const written = await tx.cvDocument.update({
      where: { id },
      data: {
        content: toStoredJson(content),
        tailorNotes: next,
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
    return { notes: next, cv: { content, language, updatedAt: written.updatedAt } }
  })
}
