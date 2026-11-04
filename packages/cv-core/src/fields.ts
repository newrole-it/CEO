import { updateBullet, updateHeader, updateItem, updateSection } from "./edit"
import { atomKey } from "./flow"
import { decodeEntities, inlineToText, sanitizeInline, textToInline } from "./sanitize"
import type { CvContent } from "./schema"

/**
 * The text fields of a CV, addressed the way the editor addresses them: `field` is the data-field
 * of the Editable in src/app/cv/[id]/atoms.tsx. An audit note points at one of these. Hidden
 * sections are left out, and so are links, the consent clause and a cover letter's section, which
 * an audit has no view on.
 */

export type CvFieldKind =
  | "name"
  | "headline"
  | "location"
  | "email"
  | "phone"
  | "text"
  | "skill"
  | "company"
  | "role"
  | "dates"
  | "summary"
  | "bullet"
  | "tech"
  | "cardTitle"
  | "cardBody"
  | "school"
  | "degree"

export type CvField = {
  field: string
  kind: CvFieldKind
  /** Inline HTML (./sanitize); otherwise plain text */
  rich: boolean
  /** The stored value */
  value: string
  /** The value as plain text; a <br> is one newline */
  text: string
  sectionId?: string
  itemId?: string
  index?: number
}

/** The fields in reading order. */
export function cvFields(content: CvContent): CvField[] {
  const fields: CvField[] = []
  const add = (
    field: string,
    kind: CvFieldKind,
    value: string,
    rich = false,
    place: Pick<CvField, "sectionId" | "itemId" | "index"> = {}
  ) => fields.push({ field, kind, rich, value, text: rich ? inlineToText(value) : value, ...place })

  const { header } = content
  add("header:name", "name", header.name)
  add("header:headline", "headline", header.headline)
  add("header:location", "location", header.location)
  add("header:email", "email", header.email)
  add("header:phone", "phone", header.phone)

  for (const section of content.sections) {
    if (section.hidden || section.type === "letter") continue
    const sectionId = section.id
    if (section.type === "text") {
      add(atomKey(sectionId, "text"), "text", section.body, true, { sectionId })
    } else if (section.type === "skills") {
      for (const item of section.items) {
        const place = { sectionId, itemId: item.id }
        add(atomKey(sectionId, item.id, "text"), "skill", item.text, true, place)
      }
    } else if (section.type === "experience") {
      for (const item of section.items) {
        const place = { sectionId, itemId: item.id }
        add(atomKey(sectionId, item.id, "company"), "company", item.company, false, place)
        add(atomKey(sectionId, item.id, "role"), "role", item.role, false, place)
        add(atomKey(sectionId, item.id, "dates"), "dates", item.dates, false, place)
        add(atomKey(sectionId, item.id, "summary"), "summary", item.summary, true, place)
        item.bullets.forEach((bullet, index) => {
          const key = atomKey(sectionId, item.id, "bullet", index)
          add(key, "bullet", bullet, true, { ...place, index })
        })
        add(atomKey(sectionId, item.id, "tech"), "tech", item.tech, true, place)
      }
    } else if (section.type === "cards") {
      for (const item of section.items) {
        const place = { sectionId, itemId: item.id }
        add(atomKey(sectionId, item.id, "title"), "cardTitle", item.title, false, place)
        add(atomKey(sectionId, item.id, "body"), "cardBody", item.body, true, place)
      }
    } else if (section.type === "education") {
      for (const item of section.items) {
        const place = { sectionId, itemId: item.id }
        add(atomKey(sectionId, item.id, "school"), "school", item.school, false, place)
        add(atomKey(sectionId, item.id, "degree"), "degree", item.degree, false, place)
        add(atomKey(sectionId, item.id, "dates"), "dates", item.dates, false, place)
      }
    }
  }
  return fields
}

/**
 * For comparing a quote with the text: typographic variants and line breaks count as equal. Keeps
 * the length, so an offset found in the result is an offset in the original.
 */
export function foldMarks(text: string): string {
  return text
    .replace(/[\n ]/g, " ")
    .replace(/[‘’‚]/g, "'")
    .replace(/[“”„«»]/g, '"')
    .replace(/[–—]/g, "-")
}

export function findQuote(text: string, quote: string): number {
  return quote ? foldMarks(text).indexOf(foldMarks(quote)) : -1
}

/** Stores a new value in the field, through the same edits the editor uses. */
export function setCvField(content: CvContent, target: CvField, value: string): CvContent {
  const key = target.field.slice(target.field.lastIndexOf(":") + 1)
  if (target.field.startsWith("header:")) return updateHeader(content, { [key]: value })
  const { sectionId, itemId } = target
  if (!sectionId) return content
  if (target.kind === "text") return updateSection(content, sectionId, { body: value })
  if (!itemId) return content
  if (target.kind === "bullet") {
    return updateBullet(content, sectionId, itemId, target.index ?? 0, value)
  }
  return updateItem(content, sectionId, itemId, { [key]: value })
}

/**
 * Replaces the plain-text offsets [start, end) of an inline HTML value and keeps the formatting
 * around them. Tags inside the replaced text stay, empty, and the sanitizer removes them.
 */
export function replaceInInline(html: string, start: number, end: number, text: string): string {
  const insert = textToInline(text)
  let out = ""
  let at = 0
  let inserted = false
  for (const token of sanitizeInline(html).match(/<[^>]+>|[^<]+/g) ?? []) {
    const isBreak = token === "<br>"
    if (token[0] === "<" && !isBreak) {
      out += token
      continue
    }
    const plain = isBreak ? "\n" : decodeEntities(token)
    const next = at + plain.length
    if (next <= start || (at >= end && inserted)) {
      out += token
    } else {
      out += textToInline(plain.slice(0, Math.max(0, start - at)))
      if (!inserted) out += insert
      inserted = true
      out += textToInline(plain.slice(Math.max(0, end - at)))
    }
    at = next
  }
  if (!inserted) out += insert
  return sanitizeInline(out)
}

/** The field with its text between the offsets replaced. */
export function replaceInField(
  content: CvContent,
  target: CvField,
  start: number,
  end: number,
  text: string
): CvContent {
  const value = target.rich
    ? replaceInInline(target.value, start, end, text)
    : `${target.text.slice(0, start)}${text.replace(/\s*\n\s*/g, " ")}${target.text.slice(end)}`
  return setCvField(content, target, value)
}
