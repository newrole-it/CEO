"use client"

import { createElement, useLayoutEffect, useRef } from "react"
import { splitParagraphs } from "@newrole/cv-core/paragraphs"
import { escapeHtml, isBlankInline, sanitizeInline, textToInline } from "@newrole/cv-core/sanitize"

export type EditableTag = "div" | "span" | "p" | "h1" | "h2" | "h3"

/** Where to put the caret in a field: its start, its end, or after that many characters. */
export type CaretPlace = "start" | "end" | number

/** Places the caret at the start or end of an element, or after `where` characters of its text. */
export function placeCaret(element: HTMLElement, where: CaretPlace = "end") {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  range.collapse(where === "start")
  if (typeof where === "number") {
    let left = where
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
    while (walker.nextNode()) {
      const node = walker.currentNode as Text
      if (left <= node.data.length) {
        range.setStart(node, left)
        range.collapse(true)
        break
      }
      left -= node.data.length
    }
  }
  selection.removeAllRanges()
  selection.addRange(range)
}

/** True when the caret (no selection) sits before the first character of the field. */
function caretAtStart(element: HTMLElement): boolean {
  const selection = window.getSelection()
  if (!selection?.rangeCount || !selection.isCollapsed) return false
  const caret = selection.getRangeAt(0)
  if (!element.contains(caret.startContainer)) return false
  const before = document.createRange()
  before.selectNodeContents(element)
  before.setEnd(caret.startContainer, caret.startOffset)
  return before.toString() === ""
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

/** A text or a job summary as the blocks the field edits: one <div> per paragraph. */
function paragraphsHtml(value: string): string {
  return splitParagraphs(value)
    .map((paragraph) => `<div>${paragraph || "<br>"}</div>`)
    .join("")
}

/**
 * The value of a paragraphs field: its blocks joined by line breaks. Each block is read on its
 * own, so an empty one is one blank line however the browser holds it open (formatting put on
 * an empty paragraph wraps its <br>, which would otherwise count as a second line).
 */
function paragraphsValue(host: HTMLElement): string {
  const blocks = [...host.children].map((block) =>
    isBlankInline(block.innerHTML) ? "" : sanitizeInline(block.innerHTML)
  )
  return sanitizeInline(blocks.join("<br>"))
}

/**
 * Keeps a paragraphs field in blocks: text typed into an empty field, or left bare by the
 * browser, is wrapped in a <div>. The caret stays where it is.
 */
function wrapBareParagraphs(host: HTMLElement) {
  const bare = [...host.childNodes].filter((node) => node.nodeName !== "DIV")
  if (!bare.length) return
  const selection = window.getSelection()
  const inside = selection?.rangeCount && host.contains(selection.anchorNode) ? selection : null
  const saved = inside
    ? {
        anchor: inside.anchorNode,
        anchorOffset: inside.anchorOffset,
        focus: inside.focusNode,
        focusOffset: inside.focusOffset,
      }
    : null
  let block: HTMLDivElement | null = null
  for (const node of [...host.childNodes]) {
    if (node.nodeName === "DIV") {
      block = null
      continue
    }
    if (!block) {
      block = document.createElement("div")
      host.insertBefore(block, node)
    }
    block.appendChild(node)
  }
  if (!saved || !selection) return
  // offsets inside the host counted its children, which have just moved
  if (saved.anchor === host || saved.focus === host) {
    const last = host.lastElementChild
    if (last instanceof HTMLElement) placeCaret(last, "end")
  } else if (saved.anchor && saved.focus) {
    selection.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset)
  }
}

/**
 * One text field on the CV sheet, edited in place. The DOM owns the text while typing: React
 * renders the initial HTML once and never rewrites it, and the DOM is replaced only when the
 * value changes from outside (undo, load), so the caret survives every keystroke.
 *
 * `rich` fields hold the inline HTML subset; the others are plain text.
 *
 * What Enter does depends on the field: `paragraphs` starts a new paragraph, `onSplit` cuts the
 * field in two (a bullet), `multiline` and `lines` break the line, and any other field calls
 * `onEnter`, which moves on to the next line of the document.
 */
export function Editable({
  as = "div",
  value,
  rich = false,
  multiline = false,
  paragraphs = false,
  lines = false,
  field,
  label,
  placeholder,
  className,
  onChange,
  onSplit,
  onEnter,
  onMergeBack,
  onBackspaceEmpty,
  onFocus,
  onBlur,
}: {
  as?: EditableTag
  value: string
  rich?: boolean
  /** Enter inserts a line break instead of doing nothing */
  multiline?: boolean
  /**
   * A rich field drawn as one block per paragraph (the text between two line breaks), so the
   * page can break between them (usePagination). Enter starts a paragraph and Backspace at its
   * start joins it to the one before, as the browser does it; the value is still one string.
   */
  paragraphs?: boolean
  /** A plain field that keeps its line breaks ("\n"), such as a letter's addressee */
  lines?: boolean
  /** Key used to find and focus this field */
  field: string
  label: string
  placeholder: string
  className?: string
  onChange: (value: string) => void
  /** Enter splits the field, e.g. a bullet into two */
  onSplit?: (before: string, after: string) => void
  /** Enter in a one-line field: go to the next line of the document, or add one */
  onEnter?: () => void
  /** Backspace at the very start of a field with text: join it to the one before */
  onMergeBack?: (html: string) => void
  /** Backspace in an empty field, e.g. deletes the bullet */
  onBackspaceEmpty?: () => void
  onFocus?: () => void
  onBlur?: () => void
}) {
  const ref = useRef<HTMLElement | null>(null)
  const render = (text: string) =>
    paragraphs ? paragraphsHtml(text) : rich ? sanitizeInline(text) : escapeHtml(text)
  const initial = useRef({ __html: render(value) })
  const last = useRef(value)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || last.current === value) return
    last.current = value
    element.innerHTML = render(value)
    if (document.activeElement === element) placeCaret(element)
  })

  function read(event?: React.FormEvent<HTMLElement>) {
    const element = ref.current
    if (!element) return
    // text being composed (a dead key, an input method) must not be moved; compositionend reads it
    if (paragraphs && (event?.nativeEvent as InputEvent | undefined)?.isComposing) return
    // Chrome leaves a lone <br> in an emptied field, which would hide the placeholder
    if (element.innerHTML === "<br>" || element.innerHTML === "<div><br></div>")
      element.innerHTML = ""
    if (paragraphs) wrapBareParagraphs(element)
    const raw = paragraphs
      ? paragraphsValue(element)
      : rich
        ? sanitizeInline(element.innerHTML)
        : lines
          ? (element.textContent ?? "").replace(/\r/g, "").replace(/\n+$/, "")
          : (element.textContent ?? "").replace(/[\r\n]+/g, " ")
    // a trailing space typed at the end of a field arrives as a non-breaking one
    const next = raw.replace(/ $/, " ")
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
    "aria-multiline": multiline || paragraphs || lines || undefined,
    "data-field": field,
    "data-ph": placeholder,
    "data-rich": rich ? "1" : undefined,
    "data-paras": paragraphs ? "1" : undefined,
    "data-lines": lines ? "1" : undefined,
    spellCheck: true,
    dangerouslySetInnerHTML: initial.current,
    onInput: read,
    onCompositionEnd: () => read(),
    onFocus,
    onBlur,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      if (event.key === "Escape") {
        event.currentTarget.blur()
        return
      }
      if (event.key === "Enter") {
        if (paragraphs) {
          // the browser splits the block; Shift+Enter would leave a <br> inside one
          if (event.shiftKey) {
            event.preventDefault()
            document.execCommand("insertParagraph")
          }
          return
        }
        event.preventDefault()
        if (onSplit && !event.shiftKey) {
          const parts = splitAtCaret(event.currentTarget)
          if (parts) {
            last.current = parts.before
            onSplit(parts.before, parts.after)
          }
        } else if (lines || (rich && (multiline || onSplit))) {
          document.execCommand("insertLineBreak")
        } else {
          onEnter?.()
        }
        return
      }
      if (event.key !== "Backspace") return
      if (onBackspaceEmpty && !(event.currentTarget.textContent ?? "").trim()) {
        event.preventDefault()
        onBackspaceEmpty()
      } else if (onMergeBack && caretAtStart(event.currentTarget)) {
        event.preventDefault()
        onMergeBack(rich ? sanitizeInline(event.currentTarget.innerHTML) : value)
      }
    },
    onPaste: (event: React.ClipboardEvent<HTMLElement>) => {
      event.preventDefault()
      const text = event.clipboardData.getData("text/plain").replace(/\r/g, "")
      if (paragraphs) {
        // one paragraph per pasted line
        text.split("\n").forEach((line, index) => {
          if (index) document.execCommand("insertParagraph")
          if (line) document.execCommand("insertText", false, line)
        })
      } else if (lines) {
        document.execCommand("insertText", false, text)
      } else if (rich && multiline && text.includes("\n")) {
        document.execCommand("insertHTML", false, textToInline(text))
      } else {
        document.execCommand("insertText", false, text.replace(/\s*\n\s*/g, " "))
      }
    },
    onDrop: (event: React.DragEvent<HTMLElement>) => event.preventDefault(),
  })
}
