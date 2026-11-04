import type { CvLocale } from "./blank"
import type { CvContent } from "./schema"
import type { TailorNotes } from "./tailor"

/**
 * What a store tells the editor about a document: its versions and the offer it was written for.
 * Both newrole.it (Postgres) and newrole CV (files) return these shapes.
 */

export type CvVersionOrigin = "auto" | "manual" | "base" | "generated" | "restored"

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
}
