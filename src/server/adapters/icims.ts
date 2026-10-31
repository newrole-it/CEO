import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { parseSitemap } from "src/server/crawler/sitemap"
import { decodeEntities } from "src/server/jobs/text"
import { polandOrRemote, stripTags, titleFromSlug } from "./html-bits"
import { parseJsonLdJobs } from "./jsonld"
import { asDate, buildListedJob } from "./parse"
import type { BoardList } from "./types"

/**
 * iCIMS career portals. Board id: the tenant slug of `careers-{slug}.icims.com`, or a full
 * vanity host for the newer "careers-home" sites. The server-rendered search page
 * (`/jobs/search?ss=1&in_iframe=1&pr={page}`) lists title, location and posting date; each job's
 * `?in_iframe=1` fragment carries a schema.org JobPosting with the description.
 * Undocumented but stable. Verified 2026-10-31 (careers-teleperformance.icims.com).
 * Big tenants are global, so only Polish, remote and unlocated postings are kept.
 */

const SEARCH_MAX_PAGES = 30

export function icimsIsVanity(boardId: string): boolean {
  return boardId.includes(".")
}

export function icimsHost(boardId: string): string {
  const trimmed = boardId.trim().toLowerCase()
  return icimsIsVanity(trimmed) ? trimmed : `careers-${trimmed}.icims.com`
}

export function icimsSearchUrl(boardId: string, page: number): string {
  return `https://${icimsHost(boardId)}/jobs/search?ss=1&in_iframe=1&pr=${page}`
}

export function icimsSitemapUrl(boardId: string): string {
  return `https://${icimsHost(boardId)}/sitemap.xml`
}

export function icimsJobId(url: string): string | null {
  return url.match(/\/jobs\/(\d+)(?:[/?#]|$)/)?.[1] ?? null
}

export function icimsFragmentUrl(boardId: string, jobUrl: string): string {
  const id = icimsJobId(jobUrl)
  if (icimsIsVanity(boardId) && id) return `https://${icimsHost(boardId)}/careers-home/jobs/${id}?in_iframe=1`
  const url = new URL(jobUrl)
  url.searchParams.set("in_iframe", "1")
  return url.toString()
}

function cleanJobUrl(href: string): string {
  try {
    const url = new URL(decodeEntities(href))
    url.searchParams.delete("in_iframe")
    url.hash = ""
    return url.toString()
  } catch {
    return href
  }
}

export type IcimsCard = {
  url: string
  id: string
  title: string
  location?: string
  country?: string
  postedAt?: Date
}

/** Job cards on a search page, plus "Page X of Y" when the page states it. */
export function parseIcimsSearch(html: string): { cards: IcimsCard[]; page?: number; pages?: number } {
  const cards: IcimsCard[] = []
  for (const item of html.matchAll(/<li\b[^>]*class="[^"]*iCIMS_JobCardItem[^"]*"[^>]*>([\s\S]*?)<\/li>/gi)) {
    const block = item[1]
    const anchor = block.match(/<a\b[^>]*href="([^"]*\/jobs\/\d+\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/i)
    if (!anchor) continue
    const url = cleanJobUrl(anchor[1])
    const id = icimsJobId(url)
    if (!id) continue
    const heading = anchor[2].match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
    const title = stripTags(heading ?? anchor[2].replace(/<span[^>]*sr-only[^>]*>[\s\S]*?<\/span>/gi, ""))
    if (!title) continue
    const location = block.match(/Job Locations<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
    const country = block.match(/Country<\/span>[\s\S]*?<dd[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)?.[1]
    const posted = block.match(/Posted Date<\/span>\s*<span[^>]*title="([^"]+)"/i)?.[1]
    cards.push({
      url,
      id,
      title,
      location: location ? stripTags(location) || undefined : undefined,
      country: country ? stripTags(country) || undefined : undefined,
      postedAt: posted ? asDate(posted) : undefined,
    })
  }
  const counter = html.match(/Search Results Page\s+(\d+)\s+of\s+(\d+)/i)
  // The paginator links name every page as pr=N (zero-based); the heading is not always rendered.
  let lastLinked = -1
  for (const link of html.matchAll(/jobs\/search\?[^"']*\bpr=(\d+)/gi)) {
    lastLinked = Math.max(lastLinked, Number(link[1]))
  }
  const pages = counter ? Number(counter[2]) : lastLinked >= 0 ? lastLinked + 1 : undefined
  return {
    cards,
    page: counter ? Number(counter[1]) : undefined,
    pages,
  }
}

export function icimsCardToJob(card: IcimsCard, boardId: string, companyName?: string): ListedJob | null {
  const location = [card.location, card.country]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(", ")
  return buildListedJob({
    externalId: card.id,
    title: card.title,
    companyName,
    locationText: location || undefined,
    publishedAt: card.postedAt,
    originalUrl: card.url,
    sourceType: "ICIMS",
    sourceBoardId: boardId,
    needsHydration: true,
  })
}

function siteTitle(html: string): string | undefined {
  const raw = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  if (!raw) return undefined
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim()
  const cleaned = text
    .replace(/\b(careers?|jobs?|job search|search results|listings?|openings?|career opportunities|at|@)\b/gi, " ")
    .replace(/[|:–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return cleaned && cleaned.length <= 80 ? cleaned : undefined
}

export async function listIcims(boardId: string, http: HttpClient, companyName?: string): Promise<BoardList> {
  const cards: IcimsCard[] = []
  let name = companyName
  let pages = 1
  for (let page = 0; page < Math.min(pages, SEARCH_MAX_PAGES); page++) {
    const response = await http.get(icimsSearchUrl(boardId, page), { accept: "text/html", maxBytes: 3_000_000 })
    if (response.status === 404 || response.status === 410)
      return { jobs: [], proven: false, companyName, note: `iCIMS ${boardId} was not found` }
    if (response.status >= 400) throw new Error(`iCIMS ${boardId} returned ${response.status}`)
    const parsed = parseIcimsSearch(response.body)
    if (page === 0 && !name) name = siteTitle(response.body)
    if (parsed.pages && parsed.pages > pages) pages = parsed.pages
    if (parsed.cards.length === 0) break
    cards.push(...parsed.cards)
  }
  if (cards.length === 0) {
    const fallback = await listFromSitemap(boardId, http)
    if (fallback === null)
      return { jobs: [], proven: false, companyName: name, note: `iCIMS ${boardId} listed no jobs` }
    cards.push(...fallback)
  }
  if (cards.length === 0) return { jobs: [], proven: true, companyName: name, note: `iCIMS ${boardId} has no open jobs` }
  const kept = cards.filter((card) => polandOrRemote([card.location, card.country].filter(Boolean).join(" ")))
  const jobs = kept.flatMap((card) => {
    const job = icimsCardToJob(card, boardId, name)
    return job ? [job] : []
  })
  const skipped = cards.length - kept.length
  return {
    jobs,
    proven: true,
    companyName: name,
    listedCount: cards.length,
    complete: pages <= SEARCH_MAX_PAGES,
    note: skipped > 0 ? `Kept ${kept.length} Polish or remote postings of ${cards.length} listed.` : undefined,
  }
}

/** Sitemap fallback when the search page is not server-rendered. Null when there is no sitemap. */
async function listFromSitemap(boardId: string, http: HttpClient): Promise<IcimsCard[] | null> {
  const response = await http.get(icimsSitemapUrl(boardId), { accept: "application/xml, text/xml", maxBytes: 8_000_000 })
  if (response.status >= 400) return null
  const parsed = parseSitemap(response.body)
  const entries = [...parsed.urls]
  for (const child of parsed.children.slice(0, 10)) {
    const sub = await http.get(child, { accept: "application/xml, text/xml", maxBytes: 8_000_000 })
    if (sub.status < 400) entries.push(...parseSitemap(sub.body).urls)
  }
  const cards: IcimsCard[] = []
  for (const entry of entries) {
    const id = icimsJobId(entry.loc)
    if (!id) continue
    const slug = entry.loc.match(/\/jobs\/\d+\/([^/?#]+)/)?.[1] ?? ""
    cards.push({
      url: entry.loc,
      id,
      title: titleFromSlug(slug) || `Job ${id}`,
      postedAt: entry.lastmod ? asDate(entry.lastmod) : undefined,
    })
  }
  return cards
}

export async function hydrateIcims(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText || !job.sourceBoardId) return job
  const response = await http.get(icimsFragmentUrl(job.sourceBoardId, job.originalUrl), {
    accept: "text/html",
    maxBytes: 2_000_000,
  })
  if (response.status >= 400) return job
  const found = parseJsonLdJobs(response.body, job.originalUrl, job.companyName, {
    provider: "icims",
    sourceType: "ICIMS",
    boardId: job.sourceBoardId,
    fullText: true,
  })[0]
  if (!found) return job
  return {
    ...job,
    ...found,
    externalId: job.externalId,
    originalUrl: job.originalUrl,
    // iCIMS writes "UNAVAILABLE" into empty address parts.
    locationText:
      found.locationText?.replace(/\bUNAVAILABLE\b,?\s*/g, "").replace(/,\s*$/, "").trim() ||
      job.locationText,
    publishedAt: found.publishedAt ?? job.publishedAt,
    needsHydration: false,
  }
}
