import type { HttpClient } from "../host"
import type { ListedJob, WorkplaceType } from "../schemas"
import { parseSitemap, type SitemapEntry } from "../crawler/sitemap"
import { mentionsPoland, metaContent, stripTags, titleFromSlug } from "./html-bits"
import { parseJsonLdJobs } from "./jsonld"
import { asDate, buildListedJob } from "./parse"
import type { BoardList } from "./types"

/**
 * Avature career portals (jobs.cisco.com, careers.qatarairways.com, jobs.lenovo.com, or
 * `{tenant}.avature.net`). Board id: the host, optionally with the portal path
 * ("careers.qatarairways.com/global"; the default portal is "careers"). The portal's
 * `sitemap_index.xml` lists one sitemap per locale with every `/JobDetail/{slug}/{id}` page.
 * Pages are server-rendered: a JobPosting JSON-LD (often title only), og:title, and labelled
 * `article__content__view__field` blocks whose richest value is the ad body.
 * Undocumented; sitemaps are advertised in robots.txt. Verified 2026-10-31 (Qatar Airways).
 * Sitemaps carry no location, so Polish-looking slugs are read first and the list is capped.
 */

const LIST_CAP = 300

export function avatureParts(boardId: string): { host: string; portal: string } {
  const trimmed = boardId
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
  const [host, ...rest] = trimmed.split("/")
  const portal = rest.filter(Boolean).pop() || "careers"
  return { host, portal }
}

export function avatureSitemapIndexUrl(boardId: string): string {
  const { host, portal } = avatureParts(boardId)
  return `https://${host}/${portal}/sitemap_index.xml`
}

export function avatureJobId(url: string): string | null {
  return url.match(/\/JobDetail\/[^/]+\/(\d+)\/?(?:[?#]|$)/i)?.[1] ?? null
}

/** The locale sitemap to read: pl_PL, then en_US, then a lone child, then the first child. */
export function pickAvatureSitemap(children: string[]): string | null {
  if (children.length === 0) return null
  const by = (locale: string) => children.find((child) => child.includes(`/${locale}/`))
  return by("pl_PL") ?? by("en_US") ?? by("en_GB") ?? children[0]
}

export function avatureEntriesToJobs(
  entries: SitemapEntry[],
  boardId: string,
  companyName?: string
): ListedJob[] {
  const seen = new Set<string>()
  const detail = entries.filter((entry) => {
    const id = avatureJobId(entry.loc)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
  detail.sort((left, right) => Number(mentionsPoland(right.loc)) - Number(mentionsPoland(left.loc)))
  return detail.slice(0, LIST_CAP).flatMap((entry) => {
    const slug = entry.loc.match(/\/JobDetail\/([^/]+)\//i)?.[1] ?? ""
    const job = buildListedJob({
      externalId: avatureJobId(entry.loc) ?? undefined,
      title: titleFromSlug(slug) || `Job ${avatureJobId(entry.loc)}`,
      companyName,
      publishedAt: entry.lastmod ? asDate(entry.lastmod) : undefined,
      originalUrl: entry.loc,
      sourceType: "AVATURE",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return job ? [job] : []
  })
}

export type AvatureDetail = {
  title?: string
  location?: string
  workplace?: WorkplaceType
  descriptionHtml?: string
}

function fieldValues(html: string): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  for (const block of html.matchAll(
    /class="[^"]*article__content__view__field(?!__)[^"]*"[^>]*>([\s\S]*?)(?=<[a-z0-9]+\b[^>]*class="[^"]*article__content__view__field(?!__)[^"]*"|<\/article|<\/section|$)/gi
  )) {
    const label = block[1].match(
      /article__content__view__field__label[^>]*>([\s\S]*?)<\/[a-z0-9]+>/i
    )?.[1]
    const value = block[1].match(/article__content__view__field__value[^>]*>([\s\S]*)$/i)?.[1]
    if (value == null) continue
    out.push({
      label: stripTags(label ?? ""),
      value: value.replace(/(\s*<\/[a-z0-9]+>)+\s*$/i, ""),
    })
  }
  return out
}

function hasProse(html: string): boolean {
  return /<(p|ul|ol|li|h[1-6]|table)\b/i.test(html)
}

function workplaceOf(value: string | undefined): WorkplaceType | undefined {
  const text = (value ?? "").toLowerCase()
  if (!text) return undefined
  if (/remote/.test(text)) return "REMOTE"
  if (/hybrid/.test(text)) return "HYBRID"
  if (/on[- ]?site|in[- ]?office/.test(text)) return "ONSITE"
  return undefined
}

/** Header fields and the ad body of a JobDetail page. */
export function parseAvatureDetail(html: string): AvatureDetail {
  const fields = fieldValues(html)
  const byLabel = (pattern: RegExp) => fields.find((field) => pattern.test(field.label))
  const location =
    stripTags(byLabel(/^locations?$/i)?.value ?? "") ||
    stripTags(
      html.match(/<strong>\s*Locations?\s*<\/strong>\s*:?\s*([\s\S]*?)(?:<\/|&nbsp;| )/i)?.[1] ?? ""
    ) ||
    undefined
  const workplace = workplaceOf(
    stripTags(byLabel(/work ?model|workplace|work ?type/i)?.value ?? "")
  )
  const ranked = fields
    .map((field) => ({
      html: field.value,
      length: stripTags(field.value).length,
      prose: hasProse(field.value),
    }))
    .filter((item) => item.length > 0)
  const body =
    ranked.filter((item) => item.prose).sort((a, b) => b.length - a.length)[0] ??
    ranked.sort((a, b) => b.length - a.length)[0]
  const og = metaContent(html, "property", "og:title") ?? undefined
  let title = og
  if (og && og.includes("|")) {
    const parts = og
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean)
    const normalizedLocation = (location ?? "").toLowerCase().replace(/[^a-z]/g, "")
    const rest = parts.filter((part) => {
      const normalized = part.toLowerCase().replace(/[^a-z]/g, "")
      return !(
        normalizedLocation &&
        (normalizedLocation.includes(normalized) || normalized.includes(normalizedLocation))
      )
    })
    title = (rest.length ? rest : parts).sort((a, b) => b.length - a.length)[0]
  }
  return {
    title: title || undefined,
    location,
    workplace,
    descriptionHtml: body && body.length >= 80 ? body.html : undefined,
  }
}

export async function listAvature(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const { host } = avatureParts(boardId)
  const name =
    companyName ||
    host
      .replace(/^(careers?|jobs?|mycareer)\./, "")
      .replace(/\.avature\.net$/, "")
      .replace(/\.[a-z]+$/, "")
  const index = await http.get(avatureSitemapIndexUrl(boardId), {
    accept: "application/xml, text/xml",
    maxBytes: 4_000_000,
  })
  if (index.status === 404)
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Avature ${boardId} has no portal sitemap`,
    }
  if (index.status >= 400) throw new Error(`Avature ${boardId} returned ${index.status}`)
  const parsedIndex = parseSitemap(index.body)
  let entries = parsedIndex.urls
  const child = pickAvatureSitemap(parsedIndex.children)
  if (child) {
    const sitemap = await http.get(child, {
      accept: "application/xml, text/xml",
      maxBytes: 8_000_000,
    })
    if (sitemap.status >= 400)
      throw new Error(`Avature sitemap ${child} returned ${sitemap.status}`)
    entries = parseSitemap(sitemap.body).urls
  }
  const jobs = avatureEntriesToJobs(entries, boardId, name)
  const listedCount = entries.filter((entry) => avatureJobId(entry.loc)).length
  if (listedCount === 0)
    return {
      jobs: [],
      proven: false,
      companyName: name,
      note: `Avature ${boardId} lists no JobDetail pages`,
    }
  return {
    jobs,
    proven: true,
    companyName: name,
    listedCount,
    complete: jobs.length >= listedCount,
    note:
      jobs.length < listedCount
        ? `Read ${jobs.length} of ${listedCount} postings, Polish slugs first.`
        : undefined,
  }
}

export async function hydrateAvature(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText) return job
  const response = await http.get(job.originalUrl, { accept: "text/html", maxBytes: 3_000_000 })
  if (response.status >= 400) return job
  const html = response.body
  const ld = parseJsonLdJobs(html, job.originalUrl, job.companyName, {
    provider: "avature",
    sourceType: "AVATURE",
    boardId: job.sourceBoardId,
    fullText: true,
  })[0]
  const detail = parseAvatureDetail(html)
  const description = ld?.descriptionText || undefined
  const hydrated = buildListedJob({
    externalId: job.externalId,
    title: detail.title || ld?.title || job.title,
    companyName: job.companyName || ld?.companyName,
    locationText: detail.location || ld?.locationText || job.locationText,
    workplaceType: detail.workplace,
    descriptionText: description,
    descriptionHtml: description ? undefined : detail.descriptionHtml,
    publishedAt: ld?.publishedAt ?? job.publishedAt,
    originalUrl: job.originalUrl,
    sourceType: "AVATURE",
    sourceBoardId: job.sourceBoardId,
    needsHydration: false,
  })
  if (!hydrated || !hydrated.descriptionText) return job
  return { ...job, ...hydrated, needsHydration: false }
}
