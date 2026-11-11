import type { CvLocale } from "./blank"
import type { CvContent, CvSection } from "./schema"
import type { TailorNotes } from "./tailor"

/**
 * What a store tells the editor about a document: its versions and the offer it was written for.
 * A store returns these shapes (newrole.it's: Postgres, apps/resume-engine-optimization/src/server/cv).
 */

/**
 * `offer`: a CV for an offer saved into the general CV it came from; the label names the offer.
 * `upload`: version 0, the PDF the CV was uploaded as. `pdf`: a PDF made from it that left the app.
 */
export type CvVersionOrigin =
  "auto" | "manual" | "base" | "generated" | "restored" | "offer" | "upload" | "pdf"

export type CvVersionView = {
  id: string
  number: number
  origin: CvVersionOrigin
  label: string | null
  sourceNumber: number | null
  language: CvLocale
  createdAt: Date
  /** The document is exactly this version right now */
  isCurrent: boolean
  /** The version keeps a PDF: the uploaded original, or one that was downloaded or sent */
  hasPdf: boolean
}

/**
 * "Popraw z AI" on one section: polish reads better at the same length, shorten is about a third
 * shorter, stronger is written for a recruiter (action verbs, results first).
 */
export type ImproveMode = "polish" | "shorten" | "stronger"

/** One section as the model rewrote it, not stored yet: the person applies it or not. */
export type ImprovedSection = {
  section: CvSection
  /** What the model says it changed, in the person's language */
  changes: string[]
  /** Names in the new text that the person's CV and profile do not have */
  unverified: string[]
  /** Fields that kept their old text because the model added a number */
  reverted: number
}

/** A CV or letter just generated for an offer, as stored. */
export type TailorResult = {
  id: string
  content: CvContent
  language: CvLocale
  notes: TailorNotes
  /** The document's updatedAt after this write, for the editor's next save */
  updatedAt: Date
}

/** What the editor shows around a tailored document. */
export type TailorContext = {
  /** `id` is the store's own id for the offer; null when the offer left the store */
  job: { id: string | null; company: string; title: string; url: string | null }
  cvId: string | null
  letterId: string | null
  notes: TailorNotes | null
  /** The general CV this CV was tailored from; null for a letter, or when that CV is gone */
  general: { id: string; title: string; language: CvLocale } | null
  /** When that CV is gone: the editable general CVs it can be saved into, the default first */
  choices: { id: string; title: string; language: CvLocale }[]
}

/**
 * What a CV for an offer still says about the offer's company, checked before it is saved as a
 * general CV.
 */
export type GeneralCvCheck = {
  /** The offer's company; empty when the CV names none */
  company: string
  /** Its consent clause names the company; the general CV gets a clause without it */
  consent: boolean
  /** Lines of the text that name the company, as they would go into the general CV */
  lines: string[]
}

/**
 * What the editor shows around a general CV or its general letter: the pair they make. The
 * letters for offers start from the letter of the CV they were tailored from.
 */
export type PairContext = {
  cvId: string
  letterId: string | null
  /** What to check in a letter the model wrote */
  notes: TailorNotes | null
}
