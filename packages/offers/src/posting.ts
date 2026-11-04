import { aiOptOut, stripPersonalData, wellFormed } from "./hygiene"
import type { HttpClient } from "./http"
import { asRecord, jobPostingNodes, locationText, textValue } from "./jsonld"
import { createRobotsCache, politeGet, type RobotsCache } from "./polite"
import { decodeEntities, htmlToText } from "./text"

/**
 * One job offer read from the link a person gave: the source policy, robots.txt and the safe
 * fetch first (polite.ts), then the page's schema.org JobPosting, or its visible text when it has
 * none. Nothing is stored here.
 */

export type Posting = {
  /** The page that was read, after redirects */
  url: string
  title: string
  company: string
  location: string | null
  /** The offer's text without personal data; empty when the site opts out of AI use */
  text: string
  /** jsonld: the page's JobPosting. page: the page's visible text, best effort. */
  source: "jsonld" | "page"
  /** The page or host reserves text and data mining or opts out of AI input */
  withheld: boolean
}

export type PostingResult =
  | { ok: true; posting: Posting }
  | { ok: false; reason: string; linkOnly: boolean }

const MAX_TEXT = 40_000

function metaContent(html: string, property: string): string | undefined {
  const name = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    if (!new RegExp(`(?:property|name)=["']${name}["']`, "i").test(tag)) continue
    const content = tag.match(/content=["']([^"']*)["']/i)?.[1]
    if (content?.trim()) return decodeEntities(content).trim()
  }
  return undefined
}

function titleTag(html: string): string | undefined {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  return title ? decodeEntities(title).replace(/\s+/g, " ").trim() || undefined : undefined
}

/** The page's main content without navigation, headers, footers and forms. */
function contentHtml(html: string): string {
  const main =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html
  return main.replace(
    /<(nav|header|footer|aside|form|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi,
    " "
  )
}

function clean(text: string): string {
  return wellFormed(stripPersonalData(text)).slice(0, MAX_TEXT).trim()
}

/** Reads the offer at `url`. Never throws: a page that may not or cannot be read says why. */
export async function readPosting(
  url: string,
  http: HttpClient,
  opts: { robots?: RobotsCache } = {}
): Promise<PostingResult> {
  const page = await politeGet(url, http, opts.robots ?? createRobotsCache())
  if (!page.ok) return page
  const html = page.response.body
  const pageUrl = page.response.url || url
  const host = new URL(pageUrl).hostname.toLowerCase()
  const withheld = aiOptOut(html, host)
  const siteName = metaContent(html, "og:site_name")
  const fallbackCompany = siteName || host.replace(/^www\./, "")

  for (const node of jobPostingNodes(html)) {
    const title = textValue(node.title) || textValue(node.name)
    if (!title?.trim()) continue
    const description = typeof node.description === "string" ? htmlToText(node.description) : ""
    return {
      ok: true,
      posting: {
        url: pageUrl,
        title: decodeEntities(title).trim(),
        company: textValue(asRecord(node.hiringOrganization)?.name)?.trim() || fallbackCompany,
        location: locationText(node.jobLocation)?.trim() || null,
        text: withheld ? "" : clean(description),
        source: "jsonld",
        withheld,
      },
    }
  }

  const title = metaContent(html, "og:title") || titleTag(html)
  if (!title) return { ok: false, reason: "The page has no job offer to read.", linkOnly: false }
  return {
    ok: true,
    posting: {
      url: pageUrl,
      title,
      company: fallbackCompany,
      location: null,
      text: withheld ? "" : clean(htmlToText(contentHtml(html))),
      source: "page",
      withheld,
    },
  }
}
