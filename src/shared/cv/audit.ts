import { z } from "zod"
import { cvFields, findQuote, replaceInField, type CvField } from "./fields"
import type { CvContent } from "./schema"

/**
 * An audit of one CV, shown on the sheet in the editor. A note stays tied to the document by its
 * text, not by offsets: when the quote is gone the note is done, whether a suggestion was applied
 * or the person rewrote the sentence, and undo brings it back. Only "skip" is stored.
 */

export const auditCategories = ["keywords", "vague", "seniority", "gaps", "format"] as const
export type AuditCategory = (typeof auditCategories)[number]

export const CvAuditNote = z.object({
  id: z.string().min(1).max(40),
  category: z.enum(auditCategories),
  severity: z.number().int().min(1).max(5),
  field: z.string().min(1).max(200),
  /**
   * quote: about the quoted words, which get the underline.
   * field: about the field as a whole, e.g. something missing from it. Nothing to underline.
   * empty: the field has no text and should; done once it has.
   */
  anchor: z.enum(["quote", "field", "empty"]),
  /** Copied exactly from the field; empty unless anchor is "quote" */
  quote: z.string().max(600),
  why: z.string().min(1).max(600),
  /** Replaces the quote word for word. Null when only the person knows the better wording. */
  rewrite: z.string().min(1).max(2000).nullable(),
  factId: z.string().max(80).nullable(),
})
export type CvAuditNote = z.infer<typeof CvAuditNote>

export const CvAuditFact = z.object({
  id: z.string(),
  role: z.string(),
  phrase: z.string(),
  matchingOffers: z.number(),
  totalOffers: z.number(),
  percent: z.number(),
  presentInProfile: z.boolean(),
  qualifies: z.boolean(),
})
export type CvAuditFact = z.infer<typeof CvAuditFact>

/** CvDocument.audit: the latest audit of that CV. */
export const CvAudit = z.object({
  score: z.number().int().min(0).max(100),
  previousScore: z.number().int().min(0).max(100).nullable(),
  summary: z.string().min(1).max(800),
  notes: z.array(CvAuditNote).max(16),
  demand: z.array(CvAuditFact),
  /** False when the notes come from the rules alone: no model, or it failed */
  usedModel: z.boolean(),
  /** Ids of the notes the person chose to skip */
  dismissed: z.array(z.string()),
  createdAt: z.string(),
})
export type CvAudit = z.infer<typeof CvAudit>

export function parseCvAudit(value: unknown): CvAudit | null {
  const parsed = CvAudit.safeParse(value)
  return parsed.success ? parsed.data : null
}

export type NoteSpot = { field: CvField; start: number; end: number }

/** Where a note applies in the content as it is now; null when it no longer applies. */
export function locateNote(
  content: CvContent,
  note: CvAuditNote,
  fields: CvField[] = cvFields(content)
): NoteSpot | null {
  const exact = fields.find((field) => field.field === note.field)
  if (note.anchor !== "quote") {
    if (!exact || (note.anchor === "empty" && exact.text.trim())) return null
    return { field: exact, start: 0, end: 0 }
  }
  // bullets move and get inserted, so a bullet note also looks at the other bullets of its role
  const bullet = note.field.match(/^(.*:bullet:)\d+$/)
  const candidates = [
    ...(exact ? [exact] : []),
    ...(bullet
      ? fields.filter((field) => field !== exact && field.field.startsWith(bullet[1]))
      : []),
  ]
  const grows = note.rewrite != null && findQuote(note.rewrite, note.quote) >= 0
  for (const field of candidates) {
    if (grows && findQuote(field.text, note.rewrite as string) >= 0) return null
    const start = findQuote(field.text, note.quote)
    if (start >= 0) return { field, start, end: start + note.quote.length }
  }
  return null
}

export type OpenNote = { note: CvAuditNote; spot: NoteSpot }

/** Notes that still apply and were not skipped, in reading order. */
export function openNotes(audit: CvAudit | null, content: CvContent): OpenNote[] {
  if (!audit) return []
  const fields = cvFields(content)
  const order = new Map(fields.map((field, index) => [field.field, index]))
  const open: OpenNote[] = []
  for (const note of audit.notes) {
    if (audit.dismissed.includes(note.id)) continue
    const spot = locateNote(content, note, fields)
    if (spot) open.push({ note, spot })
  }
  return open.sort(
    (a, b) =>
      (order.get(a.spot.field.field) ?? 0) - (order.get(b.spot.field.field) ?? 0) ||
      a.spot.start - b.spot.start
  )
}

/** The content with a note's suggestion applied; unchanged when there is nothing to apply. */
export function applyNote(content: CvContent, note: CvAuditNote): CvContent {
  if (note.rewrite == null) return content
  const spot = locateNote(content, note)
  if (!spot || note.anchor !== "quote") return content
  return replaceInField(content, spot.field, spot.start, spot.end, note.rewrite)
}

export type RailCard = { want: number; height: number }

/**
 * Tops for the comment cards beside the sheet, in the order given: each as close to its text as
 * it can be without overlapping. The active card sits exactly at its text and the others make
 * room around it, as in a document's margin.
 */
export function placeCards(cards: RailCard[], active: number, gap = 8): number[] {
  const tops = cards.map((card) => card.want)
  if (!cards.length) return tops
  const pivot = active >= 0 ? active : 0
  for (let i = pivot + 1; i < cards.length; i += 1) {
    tops[i] = Math.max(tops[i], tops[i - 1] + cards[i - 1].height + gap)
  }
  for (let i = pivot - 1; i >= 0; i -= 1) {
    tops[i] = Math.min(tops[i], tops[i + 1] - cards[i].height - gap)
  }
  if (tops[0] < 0) {
    tops[0] = 0
    for (let i = 1; i < cards.length; i += 1) {
      tops[i] = Math.max(tops[i], tops[i - 1] + cards[i - 1].height + gap)
    }
  }
  return tops
}
