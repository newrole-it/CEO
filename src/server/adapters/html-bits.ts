/**
 * Small HTML helpers for adapters that read server-rendered pages without a DOM parser.
 * Pure string work: nothing here fetches or stores anything.
 */
import { decodeEntities } from "src/server/jobs/text"

/** Inner HTML of the first element with this id, matching nested tags of the same name. */
export function innerHtmlOfId(html: string, id: string): string | null {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`, "i")
  const start = open.exec(html)
  if (!start) return null
  const tag = start[1].toLowerCase()
  const from = start.index + start[0].length
  const scanner = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
  let depth = 1
  for (const match of html.slice(from).matchAll(scanner)) {
    if (match[0].endsWith("/>")) continue
    depth += match[1] === "/" ? -1 : 1
    if (depth === 0) return html.slice(from, from + (match.index ?? 0))
  }
  return html.slice(from)
}

/** Every element with this id (some templates repeat an id per section). */
export function allInnerHtmlOfId(html: string, id: string): string[] {
  const out: string[] = []
  let rest = html
  for (let guard = 0; guard < 40; guard++) {
    const inner = innerHtmlOfId(rest, id)
    if (inner == null) break
    out.push(inner)
    const at = rest.indexOf(inner)
    rest = rest.slice(at + inner.length)
  }
  return out
}

/** The page without the element carrying this id. */
export function removeElementById(html: string, id: string): string {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid=["']${escapeRegExp(id)}["'][^>]*>`, "i")
  const start = open.exec(html)
  if (!start) return html
  const inner = innerHtmlOfId(html, id)
  if (inner == null) return html
  const tag = start[1]
  const end = html.indexOf(inner, start.index) + inner.length
  const close = html.slice(end).match(new RegExp(`^</${tag}\\s*>`, "i"))
  return html.slice(0, start.index) + html.slice(end + (close ? close[0].length : 0))
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
}

export function metaContent(html: string, attr: "name" | "property", key: string): string | null {
  const escaped = escapeRegExp(key)
  const first = html.match(
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]*content=["']([^"']*)["']`, "i")
  )
  const second = html.match(
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${escaped}["']`, "i")
  )
  const raw = first?.[1] ?? second?.[1]
  if (!raw) return null
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim()
  return text || null
}

/** A readable title from a URL slug such as "senior-java-developer". */
export function titleFromSlug(slug: string): string {
  let text = slug
  try {
    text = decodeURIComponent(slug)
  } catch {
    text = slug
  }
  return text
    .replace(/[-_+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase())
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const POLAND =
  /\b(poland|polska|polen|pologne|warsaw|warszawa|krak[oó]w|cracow|wroc[lł]aw|gda[nń]sk|gdynia|pozna[nń]|[lł][oó]d[zź]|katowice|szczecin|lublin|bydgoszcz|bia[lł]ystok|rzesz[oó]w|toru[nń]|kielce|olsztyn|opole|gliwice|zielona g[oó]ra)\b|(^|[^a-z])pl[-_ ]/i

const REMOTE = /\b(remote|zdaln|home ?office|anywhere|europe|emea)\b/i

/** True for a Polish or remote location, and for one we cannot read yet. */
export function polandOrRemote(location: string | undefined): boolean {
  if (!location || !location.trim()) return true
  return POLAND.test(location) || REMOTE.test(location)
}

/** True when the text names a Polish place. Used to rank unlocated entries. */
export function mentionsPoland(text: string): boolean {
  return POLAND.test(text)
}
