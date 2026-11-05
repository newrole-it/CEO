/**
 * Inline rich text for CV fields: a small allow-list sanitizer that needs no DOM, so the
 * server, the editor and the MCP tools clean text the same way.
 *
 * Kept: <strong>/<b> (as strong), <em>/<i> (as em), <a href> with http(s):, mailto: or tel:,
 * and <br>. Block tags (p, div, li…) become line breaks. Other tags are dropped but their text
 * is kept, except script-like tags, whose content is dropped too. The output is well-formed and
 * escaped, so it is safe as innerHTML, and sanitizing it again returns the same string.
 */

const DROP_CONTENT = new Set([
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "noscript",
  "noembed",
  "noframes",
  "template",
  "textarea",
  "title",
  "svg",
  "math",
  "select",
  "head",
  "xmp",
  "plaintext",
  "audio",
  "video",
  "canvas",
])

const BLOCK = new Set([
  "p",
  "div",
  "li",
  "ul",
  "ol",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "tr",
  "table",
  "blockquote",
  "section",
  "article",
  "header",
  "footer",
  "pre",
  "dd",
  "dt",
  "dl",
  "hr",
])

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  middot: "·",
  bull: "•",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  ldquo: "“",
  rdquo: "”",
  bdquo: "„",
  laquo: "«",
  raquo: "»",
  shy: "­",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  times: "×",
  minus: "−",
  zwj: "‍",
  zwnj: "‌",
}

/** Decodes the entities a CV realistically contains. Unknown ones stay as written. */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(#\d{1,8}|#[xX][0-9a-fA-F]{1,7}|[a-zA-Z][a-zA-Z0-9]{1,31});/g,
    (whole, code: string) => {
      if (code[0] === "#") {
        const value =
          code[1] === "x" || code[1] === "X"
            ? parseInt(code.slice(2), 16)
            : parseInt(code.slice(1), 10)
        if (
          !Number.isFinite(value) ||
          value <= 0 ||
          value > 0x10ffff ||
          (value >= 0xd800 && value <= 0xdfff)
        ) {
          return "�"
        }
        return String.fromCodePoint(value)
      }
      return NAMED[code] ?? NAMED[code.toLowerCase()] ?? whole
    }
  )
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;")
}

/** http(s), mailto and tel links only; anything else (javascript:, data:, relative) is null. */
export function safeHref(raw: string | undefined | null): string | null {
  if (!raw) return null
  const value = decodeEntities(raw).replace(/[\u0000- \u007f-\u009f]+/g, "")
  if (!value || value.length > 600) return null
  if (!/^(https?:\/\/[^/\\]|mailto:|tel:)/i.test(value)) return null
  return value
}

/** What a person types into a link box → a safe href: "x.pl", "a@b.pl" and "+48 600" all work. */
export function normalizeHref(input: string): string | null {
  const value = input.trim()
  if (!value) return null
  const direct = safeHref(value)
  if (direct) return direct
  if (/^[^\s@/:]+@[^\s@/:]+$/.test(value)) return safeHref(`mailto:${value}`)
  if (/^\+?[\d\s()-]{6,}$/.test(value)) return safeHref(`tel:${value.replace(/[^\d+]/g, "")}`)
  if (!/^[a-z][a-z0-9+.-]*:/i.test(value) && /^[^\s]+\.[^\s]+$/.test(value))
    return safeHref(`https://${value}`)
  return null
}

type Tag = {
  end: number
  name: string
  closing: boolean
  selfClosing: boolean
  attrs: Record<string, string>
}
type Skip = { end: number; skip: true }

function isLetter(char: string | undefined): boolean {
  return Boolean(char) && /[A-Za-z]/.test(char as string)
}

/** Reads one tag (or comment / doctype) starting at `at` (a "<"). Null when "<" is just text. */
function readTag(source: string, at: number): Tag | Skip | null {
  const n = source.length
  if (source.startsWith("<!--", at)) {
    const close = source.indexOf("-->", at + 4)
    return { end: close < 0 ? n : close + 3, skip: true }
  }
  const next = source[at + 1]
  if (next === "!" || next === "?") {
    const close = source.indexOf(">", at)
    return { end: close < 0 ? n : close + 1, skip: true }
  }
  const closing = next === "/"
  let j = at + (closing ? 2 : 1)
  if (!isLetter(source[j])) return null
  const nameStart = j
  while (j < n && /[A-Za-z0-9:-]/.test(source[j])) j += 1
  const name = source.slice(nameStart, j).toLowerCase()
  const attrs: Record<string, string> = {}
  let selfClosing = false
  while (j < n) {
    const char = source[j]
    if (char === ">") return { end: j + 1, name, closing, selfClosing, attrs }
    if (/\s/.test(char)) {
      j += 1
      continue
    }
    if (char === "/") {
      selfClosing = source[j + 1] === ">"
      j += 1
      continue
    }
    const attrStart = j
    while (j < n && !/[\s=>]/.test(source[j]) && !(source[j] === "/" && source[j + 1] === ">"))
      j += 1
    const attrName = source.slice(attrStart, j).toLowerCase()
    while (j < n && /\s/.test(source[j])) j += 1
    let value = ""
    if (source[j] === "=") {
      j += 1
      while (j < n && /\s/.test(source[j])) j += 1
      const quote = source[j]
      if (quote === '"' || quote === "'") {
        const close = source.indexOf(quote, j + 1)
        if (close < 0) return null
        value = source.slice(j + 1, close)
        j = close + 1
      } else {
        const valueStart = j
        while (j < n && !/[\s>]/.test(source[j])) j += 1
        value = source.slice(valueStart, j)
      }
    }
    if (attrName && !(attrName in attrs)) attrs[attrName] = value
  }
  return null
}

type Inline = "strong" | "em" | "a"

const INLINE: Record<string, Inline> = { strong: "strong", b: "strong", em: "em", i: "em", a: "a" }

/** The sanitized inline HTML subset (see the module comment). */
export function sanitizeInline(input: string | null | undefined): string {
  const source = String(input ?? "")
  const out: string[] = []
  const open: Inline[] = []
  let dropTag: string | null = null
  let dropDepth = 0
  let i = 0

  const lastIsBreak = () => out.length > 0 && out[out.length - 1] === "<br>"
  const hasText = () => out.some((piece) => piece[0] !== "<" || piece === "<br>")

  while (i < source.length) {
    const lt = source.indexOf("<", i)
    const textEnd = lt < 0 ? source.length : lt
    if (textEnd > i) {
      if (!dropTag) out.push(escapeHtml(decodeEntities(source.slice(i, textEnd))))
      i = textEnd
      continue
    }
    const tag = readTag(source, i)
    if (!tag) {
      if (!dropTag) out.push("&lt;")
      i += 1
      continue
    }
    i = tag.end
    if ("skip" in tag) continue
    if (dropTag) {
      if (tag.name === dropTag) {
        if (tag.closing) dropDepth -= 1
        else if (!tag.selfClosing) dropDepth += 1
        if (dropDepth <= 0) {
          dropTag = null
          dropDepth = 0
        }
      }
      continue
    }
    const name = tag.name
    if (name === "br") {
      out.push("<br>")
      continue
    }
    if (DROP_CONTENT.has(name)) {
      if (!tag.closing && !tag.selfClosing) {
        dropTag = name
        dropDepth = 1
      }
      continue
    }
    if (BLOCK.has(name)) {
      if (hasText() && !lastIsBreak()) out.push("<br>")
      continue
    }
    const inline = INLINE[name]
    if (!inline) continue
    if (tag.closing) {
      const at = open.lastIndexOf(inline)
      if (at < 0) continue
      while (open.length > at) out.push(`</${open.pop()}>`)
      continue
    }
    if (inline === "a") {
      if (open.includes("a")) continue
      const href = safeHref(tag.attrs.href)
      if (!href) continue
      open.push("a")
      out.push(`<a href="${escapeAttr(href)}">`)
      continue
    }
    open.push(inline)
    out.push(`<${inline}>`)
  }
  while (open.length) out.push(`</${open.pop()}>`)

  let html = out.join("")
  let previous = ""
  while (previous !== html) {
    previous = html
    html = html.replace(/<(strong|em)><\/\1>/g, "").replace(/<a href="[^"]*"><\/a>/g, "")
  }
  return html.replace(/^(?:\s*<br>)+/, "").replace(/(?:<br>\s*)+$/, "")
}

/** Plain text of an inline HTML value: <br> becomes a newline, tags go, entities decode. */
export function inlineToText(html: string | null | undefined): string {
  return decodeEntities(
    sanitizeInline(html)
      .replace(/<br>/g, "\n")
      .replace(/<[^>]+>/g, "")
  )
}

/** Plain text → inline HTML (escaped, newlines as <br>). */
export function textToInline(text: string | null | undefined): string {
  return escapeHtml(String(text ?? "").replace(/\r/g, ""))
    .split("\n")
    .join("<br>")
}

export function isBlankInline(html: string | null | undefined): boolean {
  return !inlineToText(html).replace(/[\s ​]+/g, "")
}
