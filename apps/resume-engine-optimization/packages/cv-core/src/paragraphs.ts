import { isBlankInline, sanitizeInline } from "./sanitize"

/**
 * The paragraphs of an inline value (./sanitize): the text between its line breaks. A text
 * section's body and a role's summary are stored as one string; the sheet draws each paragraph
 * as a block of its own, so a page can break between two of them.
 *
 * Formatting that spans a break is closed before it and opened again after it, so every
 * paragraph is well-formed on its own. A blank line in the middle is an empty paragraph; a
 * blank value has none. Joining the result with <br> gives the same text and formatting.
 */
export function splitParagraphs(html: string | null | undefined): string[] {
  const source = sanitizeInline(html)
  if (isBlankInline(source)) return []
  const paragraphs: string[] = []
  /** Opening tags in force, outermost first, as written (`<a href="…">`) */
  const open: string[] = []
  let current = ""
  // sanitized HTML has no "<" outside a tag, so every piece is a tag or a run of text
  for (const piece of source.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (piece === "<br>") {
      paragraphs.push(current + closing(open))
      current = open.join("")
    } else if (piece.startsWith("</")) {
      open.pop()
      current += piece
    } else if (piece.startsWith("<")) {
      open.push(piece)
      current += piece
    } else {
      current += piece
    }
  }
  paragraphs.push(current)
  // formatting reopened around nothing (a blank line inside <strong>) and a line of spaces
  // are no content: both are a blank line
  return paragraphs.map((paragraph) => (isBlankInline(paragraph) ? "" : sanitizeInline(paragraph)))
}

function closing(open: string[]): string {
  return [...open]
    .reverse()
    .map((tag) => `</${tag.slice(1).split(/[\s>]/)[0]}>`)
    .join("")
}
