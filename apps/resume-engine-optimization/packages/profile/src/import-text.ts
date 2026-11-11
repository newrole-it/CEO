import { extractPdfText } from "./pdf"
import { extractProfileFromText } from "./extract"
import { parseLinkedInProfile, type LinkedInDocument } from "./linkedin"
import { ExportError, isZipBytes, linkedInExportText, MAX_ZIP_BYTES } from "./linkedin-export"
import type { ProfileDraft } from "./schema"
import type { LlmClient } from "@newrole/llm/common"

/**
 * What a person gives to build their profile, as text: a pasted CV, a CV or LinkedIn PDF, or
 * LinkedIn's data export ZIP, alone or together. The checks and messages every app answers with.
 */

export const MAX_PDF_BYTES = 8_000_000
// Far more than any CV; every character goes to the model.
export const MAX_IMPORT_TEXT_CHARS = 60_000
// The largest file plus room for the multipart envelope and a pasted note.
export const MAX_IMPORT_BODY_BYTES = MAX_ZIP_BYTES + 1_000_000

export type ImportText =
  { ok: true; text: string } | { ok: false; status: number; error: string; code?: string }

function isZipFile(file: File): boolean {
  return /zip/.test(file.type) || file.name.toLowerCase().endsWith(".zip")
}

export async function importText(input: {
  text?: string
  file?: File | null
}): Promise<ImportText> {
  let text = input.text ?? ""
  if (text.length > MAX_IMPORT_TEXT_CHARS) {
    return {
      ok: false,
      status: 400,
      error: "That text is too long. Paste only the CV.",
      code: "too-long",
    }
  }
  const file = input.file
  if (file && file.size > 0) {
    if (isZipFile(file)) {
      if (file.size > MAX_ZIP_BYTES) {
        return { ok: false, status: 400, error: "That ZIP is larger than 50 MB." }
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      try {
        if (!isZipBytes(bytes)) throw new ExportError("not-zip", "That file is not a ZIP archive.")
        text = `${text}\n${linkedInExportText(bytes)}`.trim()
      } catch (error) {
        const code = error instanceof ExportError ? error.code : "not-zip"
        return {
          ok: false,
          status: 400,
          error: error instanceof Error ? error.message : "Could not read that ZIP.",
          code,
        }
      }
    } else {
      if (file.size > MAX_PDF_BYTES) {
        return { ok: false, status: 400, error: "That PDF is larger than 8 MB." }
      }
      if (
        file.type &&
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        return { ok: false, status: 400, error: "Upload a PDF, or paste the text instead." }
      }
      const bytes = Buffer.from(await file.arrayBuffer())
      try {
        text = `${text}\n${await extractPdfText(bytes)}`.trim()
      } catch {
        return { ok: false, status: 400, error: "Could not read that PDF. Paste the text instead." }
      }
    }
  }
  if (text.trim().length < 20) {
    return { ok: false, status: 400, error: "Add a PDF or paste more of the CV." }
  }
  // A long PDF or a full LinkedIn export can hold more text than any CV; the model gets the start.
  return { ok: true, text: text.slice(0, MAX_IMPORT_TEXT_CHARS) }
}

/**
 * CV text → a profile draft for the person to review, and the CV/LinkedIn sections it was read
 * from (kept for "CV from profile" and as facts for the model).
 */
export async function draftFromText(
  text: string,
  llm: LlmClient | null,
  userId?: number
): Promise<{ draft: ProfileDraft; document: LinkedInDocument | null }> {
  const draft = await extractProfileFromText(text, llm, userId)
  return { draft, document: parseLinkedInProfile(text) }
}
