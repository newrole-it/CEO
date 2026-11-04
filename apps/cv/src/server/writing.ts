import { blankCv, type CvLocale } from "@newrole/cv-core/blank"
import { detectLanguage } from "@newrole/cv-core/language"
import type { CvContent } from "@newrole/cv-core/schema"
import type { TailorResult } from "@newrole/cv-core/views"
import { extractPdfText } from "@newrole/profile/pdf"
import { structureCvText } from "@newrole/cv-engine/structure"
import {
  coverLetterLanguage,
  tailorCv,
  tailoredCvLanguage,
  writeCoverLetter,
  type TailorOffer,
} from "@newrole/cv-engine/tailor"
import { createLlmClient } from "@newrole/llm/client"
import type { LlmClient } from "@newrole/llm/common"
import { createWritingClient } from "@newrole/llm/writing"
import { offerText } from "./offers"
import { candidateContext } from "./profile"
import {
  createDocument,
  defaultCv,
  documentForOffer,
  firstBase,
  generatedCount,
  getDocument,
  getOffer,
  storeGenerated,
  type CvDocument,
  type Offer,
} from "./store"

/**
 * What newrole CV writes with a model: a CV tailored to an offer, a cover letter, and an editable
 * CV out of a PDF. @newrole/cv-engine does the writing exactly as in newrole.it, with the person's
 * profile as the facts it may use (profile.ts); this module picks the CV to start from and keeps
 * the result. Errors carry the codes the editor knows
 * (@newrole/cv-editor/tailor-errors).
 */

export class WritingError extends Error {
  constructor(
    readonly code: "llm-unavailable" | "llm-failed" | "no-base" | "job-not-found" | "no-content",
    message: string
  ) {
    super(message)
  }
}

export const MAX_CV_PDF_BYTES = 5_000_000

function writingClient(llm: LlmClient | null | undefined): LlmClient {
  const client = llm === undefined ? createWritingClient() : llm
  if (!client) throw new WritingError("llm-unavailable", "No model is configured.")
  return client
}

async function loadOffer(offerId: string): Promise<{ offer: Offer; tailor: TailorOffer }> {
  const offer = await getOffer(offerId)
  if (!offer) throw new WritingError("job-not-found", "This offer is not here any more.")
  const { text, origin } = await offerText(offer)
  return {
    offer,
    tailor: { company: offer.company, title: offer.title, location: offer.location, text, origin },
  }
}

/** The CV to start from: the chosen one, else the CV this one started from, else the default. */
async function baseFor(
  existing: CvDocument | null,
  baseId?: string
): Promise<{ id: string | null; content: CvContent; language: CvLocale }> {
  if (baseId || !existing) {
    const chosen = baseId ? await getDocument(baseId) : await defaultCv()
    if (!chosen || chosen.docType !== "CV")
      throw new WritingError("no-base", "There is no CV to start from.")
    return { id: chosen.id, content: chosen.content, language: chosen.language }
  }
  // tailoring again starts from the general CV, not from the last result
  const original = existing.baseId ? await getDocument(existing.baseId) : null
  if (original) return { id: original.id, content: original.content, language: original.language }
  const first = await firstBase(existing.id)
  if (first) return { id: null, ...first }
  throw new WritingError("no-base", "There is no CV to start from.")
}

/** "Dostosuj CV": the CV for the offer, or a new version of the one it already has. */
export async function tailorForOffer(input: {
  offerId: string
  baseId?: string
  language?: CvLocale
  note?: string
  locale?: CvLocale
  llm?: LlmClient | null
}): Promise<TailorResult> {
  const llm = writingClient(input.llm)
  const { offer, tailor } = await loadOffer(input.offerId)
  const existing = await documentForOffer(offer.id, "CV")
  const base = await baseFor(existing, input.baseId)
  const language = tailoredCvLanguage({
    requested: input.language,
    existing,
    offer: offer.language,
  })
  const generated = await tailorCv({
    llm,
    base,
    offer: tailor,
    language,
    locale: input.locale,
    context: await candidateContext(),
    note: input.note,
    attempt: existing ? (await generatedCount(existing.id)) + 1 : 1,
  })
  if (!generated) throw new WritingError("llm-failed", "The model did not return a usable CV.")
  const { id, updatedAt } = await storeGenerated({
    offer,
    docType: "CV",
    language,
    content: generated.content,
    notes: generated.notes,
    base,
  })
  return { id, content: generated.content, language, notes: generated.notes, updatedAt }
}

/** The cover letter, written from the CV tailored to the offer when there is one. */
export async function letterForOffer(input: {
  offerId: string
  language?: CvLocale
  note?: string
  llm?: LlmClient | null
}): Promise<TailorResult> {
  const llm = writingClient(input.llm)
  const { offer, tailor } = await loadOffer(input.offerId)
  const [existing, tailored] = await Promise.all([
    documentForOffer(offer.id, "LETTER"),
    documentForOffer(offer.id, "CV"),
  ])
  const source = tailored?.content ?? (await defaultCv())?.content
  if (!source) throw new WritingError("no-base", "There is no CV to write from.")
  const language = coverLetterLanguage({
    requested: input.language,
    letter: existing,
    cv: tailored,
    offer: offer.language,
  })
  const generated = await writeCoverLetter({
    llm,
    cv: source,
    offer: tailor,
    language,
    context: await candidateContext(),
    note: input.note,
    attempt: existing ? (await generatedCount(existing.id)) + 1 : 1,
  })
  if (!generated) throw new WritingError("llm-failed", "The model did not return a usable letter.")
  const { id, updatedAt } = await storeGenerated({
    offer,
    docType: "LETTER",
    language,
    content: generated.content,
    notes: generated.notes,
  })
  return { id, content: generated.content, language, notes: generated.notes, updatedAt }
}

/** A CV from a PDF: its text, structured by the model, or as plain text without one. */
export async function cvFromPdf(
  bytes: Buffer,
  fileName: string,
  llm: LlmClient | null = createLlmClient()
): Promise<{ document: CvDocument; reader: "llm" | "text" }> {
  let text = ""
  try {
    text = await extractPdfText(bytes)
  } catch (error) {
    console.error("cv pdf text failed", error instanceof Error ? error.message : error)
  }
  if (text.trim().length < 20)
    throw new WritingError("no-content", "No text could be read from that PDF.")
  const language = detectLanguage(text)
  const { content, reader } = await structureCvText({ text, locale: language, llm })
  const title = fileName.replace(/\.pdf$/i, "").trim() || "CV"
  return { document: await createDocument({ title, language, content }), reader }
}

/** An empty CV in the layout, to fill in by hand. */
export function blankDocument(language: CvLocale): Promise<CvDocument> {
  return createDocument({
    title: language === "en" ? "My CV" : "Moje CV",
    language,
    content: blankCv(language),
  })
}
