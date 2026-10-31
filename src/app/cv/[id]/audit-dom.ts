import { foldMarks } from "src/shared/cv/fields"

/**
 * The audit's view of an Editable: squiggles are CSS highlights over live Ranges, so they add no
 * element to the field, cannot reach the saved HTML or the PDF, and cannot move the text.
 */

/** Painted in this order; the active note goes on top of its category. */
export const HIGHLIGHT_ACTIVE = "cva-active"

export function fieldElement(flow: HTMLElement, field: string): HTMLElement | null {
  return flow.querySelector<HTMLElement>(`[data-field="${CSS.escape(field)}"]`)
}

/** The range of a quote in the field as it is on the page; <br> counts as one character. */
export function quoteRange(element: HTMLElement, quote: string): Range | null {
  const pieces: { node: Text; start: number }[] = []
  let text = ""
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT)
  while (walker.nextNode()) {
    const node = walker.currentNode
    if (node.nodeType === Node.TEXT_NODE) {
      pieces.push({ node: node as Text, start: text.length })
      text += (node as Text).data
    } else if (node.nodeName === "BR") {
      text += "\n"
    }
  }
  const start = foldMarks(text).indexOf(foldMarks(quote))
  if (start < 0 || !quote) return null
  const end = start + quote.length
  const first = [...pieces].reverse().find((piece) => piece.start <= start)
  const last = [...pieces].reverse().find((piece) => piece.start < end)
  if (!first || !last) return null
  const range = document.createRange()
  range.setStart(first.node, Math.min(start - first.start, first.node.data.length))
  range.setEnd(last.node, Math.min(end - last.start, last.node.data.length))
  return range
}

/** A placeholder such as "[liczba]" left in the field, to select after applying a suggestion. */
export function placeholderRange(element: HTMLElement): Range | null {
  const found = (element.textContent ?? "").match(/\[[^\]\n]{1,60}\]/)
  return found ? quoteRange(element, found[0]) : null
}

export function selectRange(element: HTMLElement, range: Range) {
  element.focus()
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function highlightsSupported(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS
}

/** Replaces every audit highlight on the page with the given groups. */
export function paintHighlights(groups: Map<string, Range[]>) {
  if (!highlightsSupported()) return
  for (const name of [...CSS.highlights.keys()]) {
    if (name.startsWith("cva-") && !groups.has(name)) CSS.highlights.delete(name)
  }
  for (const [name, ranges] of groups) {
    const highlight = new Highlight(...ranges)
    if (name === HIGHLIGHT_ACTIVE) highlight.priority = 1
    CSS.highlights.set(name, highlight)
  }
}

/** A note about a whole field has no words to underline, so the active one outlines the field. */
export function markField(flow: HTMLElement | null, element: HTMLElement | null) {
  flow?.querySelector("[data-cva-field]")?.removeAttribute("data-cva-field")
  element?.setAttribute("data-cva-field", "1")
}

/** Where a note sits on the page, in viewport coordinates. */
export function anchorTop(element: HTMLElement, range: Range | null): number {
  const rect = range?.getClientRects()[0] ?? element.getBoundingClientRect()
  return rect.top
}

export function rangeContains(range: Range, x: number, y: number): boolean {
  return [...range.getClientRects()].some(
    (rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  )
}

/** Brings a place on the page near the top third of the window, unless it is already in view. */
export function revealTop(top: number) {
  const margin = 140
  if (top > margin && top < window.innerHeight * 0.6) return
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  window.scrollBy({ top: top - window.innerHeight / 3, behavior: still ? "auto" : "smooth" })
}
