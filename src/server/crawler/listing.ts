import { decodeEntities } from "src/server/jobs/text"

const NAV =
  /^(home|menu|search|privacy|cookie|cookies|login|log in|sign in|about|contact|blog|news|legal|terms|regulamin|more|więcej|apply|aplikuj|#)$/i

export function extractListingLinks(
  html: string,
  pageUrl: string
): Array<{ title: string; url: string }> {
  const links: Array<{ title: string; url: string }> = []
  const seen = new Set<string>()
  const pattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (const match of html.matchAll(pattern)) {
    const href = match[1].trim()
    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("mailto:") ||
      href.startsWith("javascript:")
    )
      continue
    const title = decodeEntities(
      match[2]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    )
    if (title.length < 2 || NAV.test(title)) continue
    let url: URL
    try {
      url = new URL(href, pageUrl)
    } catch {
      continue
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    const key = url.toString()
    if (seen.has(key)) continue
    seen.add(key)
    links.push({ title, url: key })
  }
  return links
}

export function htmlJobTitle(html: string): string | undefined {
  const og =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i)?.[1]
  const raw = og || html.match(/<title>([^<]+)<\/title>/i)?.[1]
  if (!raw) return undefined
  const title = decodeEntities(raw).replace(/\s+/g, " ").trim()
  const cut = title.split(/\s+[|–—-]\s+/)[0]?.trim()
  return cut || undefined
}
