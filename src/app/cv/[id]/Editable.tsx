"use client"

import { createElement, useLayoutEffect, useRef } from "react"
import { escapeHtml, sanitizeInline, textToInline } from "src/shared/cv/sanitize"

export type EditableTag = "div" | "span" | "p" | "h1" | "h2" | "h3"

/** Places the caret at the start or end of an element. */
export function placeCaret(element: HTMLElement, where: "start" | "end" = "end") {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(where === "start")
  selection.removeAllRanges()
  selection.addRange(range)
}

/**
 * Splits a field at the caret: what is before stays in the element, what is after is returned
 * as sanitized HTML. Inline formatting that spans the caret continues on both sides.
 */
function splitAtCaret(element: HTMLElement): { before: string; after: string } | null {
  const selection = window.getSelection()
  if (!selection?.rangeCount) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.endContainer)) return null
  range.deleteContents()
  const tail = document.createRange()
  tail.setStart(range.endContainer, range.endOffset)
  tail.setEnd(element, element.childNodes.length)
  const box = document.createElement("div")
  box.appendChild(tail.extractContents())
  return { before: sanitizeInline(element.innerHTML), after: sanitizeInline(box.innerHTML) }
}

/**
 * One text field on the CV sheet, edited in place. The DOM owns the text while typing: React
 * renders the initial HTML once and never rewrites it, and the DOM is replaced only when the
 * value changes from outside (undo, load), so the caret survives every keystroke.
 *
 * `rich` fields hold the inline HTML subset; the others are plain text.
 */
export function Editable({
  as = "div",
  value,
  rich = false,
  multiline = false,
  field,
  label,
  placeholder,
  className,
  onChange,
  onSplit,
  onBackspaceEmpty,
  onFocus,
  onBlur,
}: {
  as?: EditableTag
  value: string
  rich?: boolean
  /** Enter inserts a line break instead of doing nothing */
  multiline?: boolean
  /** Key used to find and focus this field */
  field: string
  label: string
  placeholder: string
  className?: string
  onChange: (value: string) => void
  /** Enter splits the field, e.g. a bullet into two */
  onSplit?: (before: string, after: string) => void
  /** Backspace in an empty field, e.g. deletes the bullet */
  onBackspaceEmpty?: () => void
  onFocus?: () => void
  onBlur?: () => void
}) {
  const ref = useRef<HTMLElement | null>(null)
  const render = (text: string) => (rich ? sanitizeInline(text) : escapeHtml(text))
  const initial = useRef({ __html: render(value) })
  const last = useRef(value)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || last.current === value) return
    last.current = value
    element.innerHTML = render(value)
    if (document.activeElement === element) placeCaret(element)
  })

  function read() {
    const element = ref.current
    if (!element) return
    // Chrome leaves a lone <br> in an emptied field, which would hide the placeholder
    if (element.innerHTML === "<br>") element.innerHTML = ""
    const raw = rich
      ? sanitizeInline(element.innerHTML)
      : (element.textContent ?? "").replace(/[\r\n]+/g, " ")
    // a trailing space typed at the end of a field arrives as a non-breaking one
    const next = raw.replace(/ $/, " ")
    last.current = next
    onChange(next)
  }

  return createElement(as, {
    ref,
    className,
    contentEditable: rich ? true : "plaintext-only",
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": label,
    "aria-multiline": multiline || undefined,
    "data-field": field,
    "data-ph": placeholder,
    "data-rich": rich ? "1" : undefined,
    spellCheck: true,
    dangerouslySetInnerHTML: initial.current,
    onInput: read,
    onFocus,
    onBlur,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.currentTarget.blur()
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        if (onSplit && !event.shiftKey) {
          const parts = splitAtCaret(event.currentTarget)
          if (parts) {
            last.current = parts.before
            onSplit(parts.before, parts.after)
          }
        } else if (rich && (multiline || onSplit)) {
          document.execCommand("insertLineBreak")
        }
        return
      }
      if (
        event.key === "Backspace" &&
        onBackspaceEmpty &&
        !(event.currentTarget.textContent ?? "").trim()
      ) {
        event.preventDefault()
        onBackspaceEmpty()
      }
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      event.preventDefault()
      const text = event.clipboardData.getData("text/plain").replace(/\r/g, "")
      if (rich && multiline && text.includes("\n")) {
        document.execCommand("insertHTML", false, textToInline(text))
      } else {
        document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "))
      }
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
  })
}
