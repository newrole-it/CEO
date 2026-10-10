import { gunzipSync } from "zlib"
import db from "db"
import type { HttpClient } from "src/server/security/safe-fetch"
import { noteHostInterval } from "src/server/security/safe-fetch"
import { UnsafeUrlError } from "src/server/security/url-safety"
import type { ListedJob, SourceType } from "src/shared/schemas"
import { takeDetailSlot } from "src/server/crawler/budget"
import { excerpt } from "src/server/crawler/hygiene"
import { feedUrlFromLlms, parseJobFeed } from "src/server/crawler/job-feed"
import { extractListingLinks, htmlJobTitle } from "src/server/crawler/listing"
import { emptyRobots, parseRobots, robotsAllows, type RobotsRules } from "src/server/crawler/robots"
import { parseSitemap, type SitemapEntry } from "src/server/crawler/sitemap"
import { pairContractVariants } from "src/server/crawler/variants"
import { htmlToText } from "src/server/jobs/text"
import { parseJsonLdJobs } from "./jsonld"
import { buildListedJob } from "./parse"
import { parseSuccessFactorsJob } from "./successfactors"
import type { BoardList } from "./types"

type Platform = "successfactors" | "workday" | "career"
type DetailKind = "microdata" | "jsonld" | "html" | "none"
type CareerMode = "sitemap" | "feed" | "listing" | "search"

type CareerTarget = {
  platform: Platform
  provider: SourceType
  companyName: string
  siteUrl: string
  host: string
  boardId: string
  sitemapUrl?: string
  blockedHost?: string
  cxs?: { tenant: string; cluster: string; site: string }
  mode: CareerMode
  feedUrl?: string
  listingUrl?: string
  jobPath: (pathname: string) => boolean
  detail: DetailKind
  discoverFeed: boolean
  rankPlaces: boolean
  countCaution?: string
}

const PLACES = [
  "poland",
  "warsaw",
  "warszawa",
  "krakow",
  "kraków",
  "wroclaw",
  "wrocław",
  "gdansk",
  "gdańsk",
  "poznan",
  "poznań",
  "lodz",
  "łódź",
  "remote",
  "europe",
]

function pathIncludes(fragment: string): (pathname: string) => boolean {
  return (pathname) => pathname.toLowerCase().includes(fragment.toLowerCase())
}

function pathMatches(pattern: RegExp): (pathname: string) => boolean {
  return (pathname) => pattern.test(pathname)
}

const KNOWN: Record<string, Omit<CareerTarget, "provider" | "boardId">> = {
  "jobs.gft.com": {
    platform: "successfactors",
    companyName: "GFT",
    siteUrl: "https://jobs.gft.com/",
    host: "jobs.gft.com",
    sitemapUrl: "https://jobs.gft.com/sitemap.xml",
    mode: "sitemap",
    jobPath: pathIncludes("/job/"),
    detail: "microdata",
    discoverFeed: false,
    rankPlaces: false,
  },
  "careers.allegro.eu": {
    platform: "successfactors",
    companyName: "Allegro",
    siteUrl: "https://careers.allegro.eu/",
    host: "careers.allegro.eu",
    sitemapUrl: "https://careers.allegro.eu/sitemap.xml",
    blockedHost: "career55.sapsf.eu",
    mode: "sitemap",
    jobPath: pathIncludes("/job/"),
    detail: "microdata",
    discoverFeed: false,
    rankPlaces: true,
  },
  "www.pracujwgp.pl": {
    platform: "career",
    companyName: "Grupa Pracuj",
    siteUrl: "https://www.pracujwgp.pl/",
    host: "www.pracujwgp.pl",
    mode: "feed",
    feedUrl: "https://www.pracujwgp.pl/jobs.feed.json",
    jobPath: () => false,
    detail: "none",
    discoverFeed: true,
    rankPlaces: false,
  },
  "sii.pl": {
    platform: "career",
    companyName: "Sii Polska",
    siteUrl: "https://sii.pl/",
    host: "sii.pl",
    sitemapUrl: "https://sii.pl/sitemap.xml",
    mode: "sitemap",
    jobPath: pathIncludes("/oferty-pracy/id/"),
    detail: "jsonld",
    discoverFeed: true,
    rankPlaces: false,
  },
  "careers.zabkagroup.com": {
    platform: "career",
    companyName: "Żabka Group",
    siteUrl: "https://careers.zabkagroup.com/",
    host: "careers.zabkagroup.com",
    sitemapUrl: "https://careers.zabkagroup.com/sitemap_index.xml",
    mode: "sitemap",
    jobPath: pathMatches(/\/(?:oferta-pracy|job-offer)\/[^/]+/i),
    detail: "jsonld",
    discoverFeed: true,
    rankPlaces: false,
  },
  "bolt.eu": {
    platform: "career",
    companyName: "Bolt",
    siteUrl: "https://bolt.eu/en/careers/positions/",
    host: "bolt.eu",
    listingUrl: "https://bolt.eu/en/careers/positions/",
    mode: "listing",
    jobPath: pathMatches(/\/careers\/positions\/[0-9a-f-]{8,}/i),
    detail: "html",
    discoverFeed: false,
    rankPlaces: false,
  },
  "career.comarch.com": {
    platform: "career",
    companyName: "Comarch",
    siteUrl: "https://career.comarch.com/",
    host: "career.comarch.com",
    sitemapUrl: "https://career.comarch.com/sitemap.xml",
    mode: "sitemap",
    jobPath: pathMatches(/\/job-offers\/[^/]+/i),
    detail: "html",
    discoverFeed: true,
    rankPlaces: false,
  },
  "careers.epam.com": {
    platform: "career",
    companyName: "EPAM",
    siteUrl: "https://careers.epam.com/",
    host: "careers.epam.com",
    sitemapUrl: "https://careers.epam.com/sitemap.xml.gz",
    mode: "sitemap",
    jobPath: pathIncludes("/vacancy/"),
    detail: "jsonld",
    discoverFeed: true,
    rankPlaces: true,
    countCaution:
      "The public listing showed about 225 jobs, so this sitemap count is not the live total. datePosted values were uniform, so freshness is uncertain.",
  },
  "kariera.wp.pl": {
    platform: "career",
    companyName: "Wirtualna Polska",
    siteUrl: "https://kariera.wp.pl/oferty-pracy",
    host: "kariera.wp.pl",
    listingUrl: "https://kariera.wp.pl/oferty-pracy",
    mode: "listing",
    jobPath: () => false,
    detail: "none",
    discoverFeed: false,
    rankPlaces: false,
  },
  "packhelp.com": {
    platform: "career",
    companyName: "Packhelp",
    siteUrl: "https://packhelp.com/career/",
    host: "packhelp.com",
    listingUrl: "https://packhelp.com/career/",
    mode: "listing",
    jobPath: () => false,
    detail: "none",
    discoverFeed: false,
    rankPlaces: false,
  },
  "brand24.com": {
    platform: "career",
    companyName: "Brand24",
    siteUrl: "https://brand24.com/careers/",
    host: "brand24.com",
    sitemapUrl: "https://brand24.com/sitemap.xml",
    listingUrl: "https://brand24.com/careers/",
    mode: "sitemap",
    jobPath: pathMatches(/\/careers\/[^/]+\/?$/i),
    detail: "html",
    discoverFeed: true,
    rankPlaces: false,
  },
  "www.synerise.com": {
    platform: "career",
    companyName: "Synerise",
    siteUrl: "https://www.synerise.com/careers",
    host: "www.synerise.com",
    listingUrl: "https://www.synerise.com/careers",
    mode: "search",
    jobPath: pathMatches(/\/careers\/[^/]+\/?$/i),
    detail: "jsonld",
    discoverFeed: false,
    rankPlaces: false,
  },
}

function sameSite(left: string, right: string): boolean {
  return left.toLowerCase().replace(/^www\./, "") === right.toLowerCase().replace(/^www\./, "")
}

function workdayTarget(boardId: string, companyName?: string): CareerTarget | null {
  const match = boardId.match(/^([^/]+)\/wd(\d+)\/(.+)$/i)
  if (!match) return null
  const tenant = match[1]
  const cluster = match[2]
  const site = match[3]
  const host = `${tenant}.wd${cluster}.myworkdayjobs.com`
  return {
    platform: "workday",
    provider: "WORKDAY",
    companyName: companyName || tenant,
    siteUrl: `https://${host}/${site}`,
    host,
    boardId,
    cxs: { tenant, cluster, site },
    mode: "sitemap",
    jobPath: pathIncludes("/job/"),
    detail: "jsonld",
    discoverFeed: false,
    rankPlaces: false,
  }
}

function targetFor(boardId: string, companyName?: string): CareerTarget | null {
  const known = KNOWN[boardId.toLowerCase()]
  if (known) {
    const provider: SourceType = known.platform === "career" ? "CAREER_SITE" : "SUCCESSFACTORS"
    return {
      ...known,
      provider,
      boardId,
      companyName: companyName || known.companyName,
    }
  }
  return workdayTarget(boardId, companyName)
}

function detailLimit(): number {
  const parsed = Number(process.env.CAREER_DETAIL_LIMIT || 40)
  if (!Number.isFinite(parsed) || parsed < 0) return 40
  return Math.min(200, parsed)
}

function rankUrl(loc: string, target: CareerTarget): number {
  const lower = loc.toLowerCase()
  if (lower.includes("principal-solution-architect")) return 0
  if (target.rankPlaces && PLACES.some((place) => lower.includes(place))) return 1
  if (lower.includes("/poland/")) return 1
  if (lower.includes("/job/")) return 2
  return 3
}

async function readRobots(
  url: string,
  http: HttpClient
): Promise<{ rules: RobotsRules; status: number; note?: string }> {
  try {
    const response = await http.get(url, {
      accept: "text/plain",
      maxBytes: 200_000,
      timeoutMs: 20_000,
    })
    if (response.status === 404) return { rules: emptyRobots(), status: 404 }
    if (response.status === 401 || response.status === 403 || response.status === 503) {
      return {
        rules: emptyRobots(),
        status: response.status,
        note: `robots.txt returned ${response.status}. Not bypassing a login or bot wall.`,
      }
    }
    if (response.status >= 400) {
      return {
        rules: emptyRobots(),
        status: response.status,
        note: `robots.txt returned ${response.status}`,
      }
    }
    return { rules: parseRobots(response.body), status: response.status }
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return { rules: emptyRobots(), status: 0, note: error.message }
    }
    throw error
  }
}

async function fetchText(
  url: string,
  http: HttpClient,
  accept: string,
  maxBytes: number
): Promise<{ status: number; body: string; url: string }> {
  const gzip = /\.gz(\?|$)/i.test(url)
  const response = await http.get(url, {
    accept,
    maxBytes,
    encoding: gzip ? "base64" : undefined,
  })
  if (!gzip || response.status >= 400) return response
  const bytes = Buffer.from(response.body, "base64")
  const body =
    bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
      ? gunzipSync(bytes).toString("utf8")
      : bytes.toString("utf8")
  return { ...response, body }
}

async function collectSitemaps(
  start: string,
  http: HttpClient,
  rules: RobotsRules,
  depth = 0
): Promise<SitemapEntry[]> {
  if (depth > 3) return []
  let path = "/"
  try {
    path = new URL(start).pathname
  } catch {
    return []
  }
  if (!robotsAllows(rules, path)) return []
  const response = await fetchText(
    start,
    http,
    "application/xml, text/xml, application/gzip",
    8_000_000
  )
  if (response.status >= 400) return []
  const parsed = parseSitemap(response.body)
  const urls = [...parsed.urls]
  for (const child of parsed.children.slice(0, 8)) {
    urls.push(...(await collectSitemaps(child, http, rules, depth + 1)))
  }
  return urls
}

function jobUrls(entries: SitemapEntry[], target: CareerTarget): SitemapEntry[] {
  const seen = new Set<string>()
  const jobs: SitemapEntry[] = []
  for (const entry of entries) {
    let pathname = ""
    try {
      pathname = new URL(entry.loc).pathname
    } catch {
      continue
    }
    if (!target.jobPath(pathname)) continue
    if (seen.has(entry.loc)) continue
    seen.add(entry.loc)
    jobs.push(entry)
  }
  return jobs.sort(
    (a, b) => rankUrl(a.loc, target) - rankUrl(b.loc, target) || a.loc.localeCompare(b.loc)
  )
}

function htmlJob(html: string, pageUrl: string, target: CareerTarget): ListedJob | null {
  const title = htmlJobTitle(html)
  if (!title) return null
  const meta = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]
  const description = excerpt(htmlToText(meta || ""))
  return buildListedJob({
    title,
    companyName: target.companyName,
    descriptionText: description || undefined,
    originalUrl: pageUrl,
    sourceType: target.provider,
    sourceBoardId: target.boardId,
    needsHydration: false,
  })
}

async function fetchJobPage(
  entry: SitemapEntry,
  http: HttpClient,
  target: CareerTarget,
  rules: RobotsRules
): Promise<ListedJob | null> {
  let url: URL
  try {
    url = new URL(entry.loc)
  } catch {
    return null
  }
  if (!sameSite(url.hostname, target.host)) return null
  if (url.searchParams.get("loginFlowRequired") === "true") return null
  if (!robotsAllows(rules, url.pathname)) return null
  if (target.detail === "none") return null
  const allowed = await takeDetailSlot(target.host)
  if (!allowed) return null
  const headers: Record<string, string> = {}
  if (entry.lastmod) headers["If-Modified-Since"] = entry.lastmod
  const response = await http.get(url.toString(), {
    accept: "text/html",
    maxBytes: 1_500_000,
    headers,
  })
  if (response.status === 304 || response.status >= 400) return null
  const pageUrl = response.url || url.toString()
  const html = response.body
  if (target.detail === "microdata" || target.platform === "successfactors") {
    return parseSuccessFactorsJob(html, pageUrl, target.companyName, target.boardId)
  }
  if (target.detail === "html") return htmlJob(html, pageUrl, target)
  const found = parseJsonLdJobs(html, pageUrl, target.companyName, {
    provider: "career",
    sourceType: target.provider,
    boardId: target.boardId,
  })
  return found[0] ?? htmlJob(html, pageUrl, target)
}

function isLinkOutHost(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return host.endsWith("erecruiter.pl") || host.endsWith("peopleforce.io")
}

function listedFromTitle(title: string, url: string, target: CareerTarget): ListedJob | null {
  return buildListedJob({
    title,
    companyName: target.companyName,
    originalUrl: url,
    sourceType: target.provider,
    sourceBoardId: target.boardId,
    needsHydration: false,
  })
}

async function readListing(
  target: CareerTarget,
  http: HttpClient,
  rules: RobotsRules
): Promise<BoardList> {
  const listingUrl = target.listingUrl || target.siteUrl
  let path = "/"
  try {
    path = new URL(listingUrl).pathname
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName: target.companyName,
      note: "Listing URL is invalid.",
    }
  }
  if (!robotsAllows(rules, path)) {
    return {
      jobs: [],
      proven: false,
      companyName: target.companyName,
      note: "The listing path is disallowed by robots.txt.",
    }
  }
  const response = await http.get(listingUrl, { accept: "text/html", maxBytes: 1_500_000 })
  if (response.status >= 400) {
    return {
      jobs: [],
      proven: false,
      companyName: target.companyName,
      note: `Listing page returned ${response.status}.`,
    }
  }
  const pageUrl = response.url || listingUrl
  const candidates = extractListingLinks(response.body, pageUrl).flatMap((link) => {
    let url: URL
    try {
      url = new URL(link.url)
    } catch {
      return []
    }
    const same = sameSite(url.hostname, target.host)
    if (same && target.jobPath(url.pathname)) return [link]
    if (!same && target.detail === "none" && isLinkOutHost(url.hostname)) return [link]
    return []
  })
  const jobs: ListedJob[] = []
  const limit = detailLimit()
  let fetched = 0
  for (const link of candidates) {
    const host = new URL(link.url).hostname
    const enrich =
      target.detail !== "none" &&
      sameSite(host, target.host) &&
      fetched < limit &&
      robotsAllows(rules, new URL(link.url).pathname)
    if (!enrich) {
      const listed = listedFromTitle(link.title, link.url, target)
      if (listed) jobs.push(listed)
      continue
    }
    const slot = await takeDetailSlot(target.host)
    if (!slot) {
      const listed = listedFromTitle(link.title, link.url, target)
      if (listed) jobs.push(listed)
      continue
    }
    fetched += 1
    try {
      const page = await http.get(link.url, { accept: "text/html", maxBytes: 1_500_000 })
      if (page.status >= 400) {
        const listed = listedFromTitle(link.title, link.url, target)
        if (listed) jobs.push(listed)
        continue
      }
      const parsed =
        target.detail === "jsonld"
          ? parseJsonLdJobs(page.body, page.url || link.url, target.companyName, {
              provider: "career",
              sourceType: target.provider,
              boardId: target.boardId,
            })[0]
          : htmlJob(page.body, page.url || link.url, target)
      const chosen = parsed ?? listedFromTitle(link.title, link.url, target)
      if (chosen) jobs.push(chosen)
    } catch (error) {
      if (error instanceof UnsafeUrlError) break
      const listed = listedFromTitle(link.title, link.url, target)
      if (listed) jobs.push(listed)
    }
  }
  const note =
    target.mode === "search" && jobs.length === 0
      ? "Listing API /api/cms/job-postings is disallowed by robots.txt. Job pages are fetched when web search finds them."
      : `${candidates.length} links on the listing. Fetched ${fetched} detail pages. Off-host detail links stay link-outs.`
  return {
    jobs: jobs.filter((job): job is ListedJob => Boolean(job)),
    proven: jobs.length > 0 || target.mode === "search",
    companyName: target.companyName,
    note,
  }
}

async function tryFeed(
  target: CareerTarget,
  http: HttpClient,
  rules: RobotsRules
): Promise<BoardList | null> {
  const origin = `https://${target.host}`
  let feedUrl = target.feedUrl
  if (robotsAllows(rules, "/llms.txt")) {
    try {
      const llms = await http.get(`${origin}/llms.txt`, { accept: "text/plain", maxBytes: 200_000 })
      if (llms.status < 400) {
        const found = feedUrlFromLlms(llms.body, `${origin}/`)
        if (found) feedUrl = found
      }
    } catch (error) {
      if (error instanceof UnsafeUrlError) return null
    }
  }
  if (!feedUrl && target.mode === "feed") feedUrl = `${origin}/jobs.feed.json`
  if (!feedUrl && target.discoverFeed) feedUrl = `${origin}/jobs.feed.json`
  if (!feedUrl) return null
  let feedHost = ""
  let path = "/"
  try {
    const parsed = new URL(feedUrl)
    feedHost = parsed.hostname
    path = parsed.pathname
  } catch {
    return null
  }
  if (!sameSite(feedHost, target.host)) return null
  if (!robotsAllows(rules, path)) return null
  try {
    const response = await http.get(feedUrl, {
      accept: "application/json, text/plain",
      maxBytes: 2_000_000,
    })
    if (response.status >= 400) return null
    const jobs = parseJobFeed(response.body, {
      companyName: target.companyName,
      boardId: target.boardId,
      sourceType: target.provider,
      feedUrl,
    })
    if (!jobs.length) return null
    return {
      jobs,
      proven: true,
      companyName: target.companyName,
      note: `Published feed listed ${jobs.length} jobs. Detail hosts were not fetched.`,
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError) return null
    throw error
  }
}

async function cxsPoland(target: CareerTarget, http: HttpClient): Promise<ListedJob[]> {
  if (!target.cxs || !http.post) return []
  const { tenant, cluster, site } = target.cxs
  const endpoint = `https://${tenant}.wd${cluster}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`
  const jobs: ListedJob[] = []
  let blocked = 0
  for (let page = 0; page < 5; page++) {
    const slot = await takeDetailSlot(target.host)
    if (!slot) break
    let response
    try {
      response = await http.post(
        endpoint,
        JSON.stringify({ limit: 20, offset: page * 20, appliedFacets: {}, searchText: "Poland" }),
        {
          accept: "application/json",
          maxBytes: 1_500_000,
          headers: { "Content-Type": "application/json" },
        }
      )
    } catch (error) {
      if (error instanceof UnsafeUrlError) break
      throw error
    }
    if (response.status === 403 || response.status === 503) {
      blocked += 1
      if (blocked >= 3) break
      continue
    }
    if (response.status >= 400) break
    const payload = JSON.parse(response.body) as {
      jobPostings?: Array<{ title?: string; externalPath?: string; locationsText?: string }>
    }
    const postings = payload.jobPostings ?? []
    if (!postings.length) break
    for (const posting of postings) {
      if (!posting.title || !posting.externalPath) continue
      const originalUrl = `https://${tenant}.wd${cluster}.myworkdayjobs.com/${site}${posting.externalPath}`
      const listed = buildListedJob({
        title: posting.title,
        companyName: target.companyName,
        locationText: posting.locationsText,
        originalUrl,
        sourceType: "WORKDAY",
        sourceBoardId: target.boardId,
        needsHydration: true,
      })
      if (listed) jobs.push(listed)
    }
  }
  return jobs
}

async function loadCached(target: CareerTarget, boardId: string): Promise<ListedJob[] | null> {
  if (process.env.VITEST) return null
  try {
    const page = await db.careerPage.findUnique({
      where: { provider_providerBoardId: { provider: target.provider, providerBoardId: boardId } },
    })
    if (!page?.lastSuccessfulFetchAt) return null
    const age = Date.now() - page.lastSuccessfulFetchAt.getTime()
    if (age > 24 * 60 * 60 * 1000) return null
    const rows = await db.job.findMany({
      where: { careerPageId: page.id, status: "ACTIVE" },
      take: 500,
      orderBy: { lastSeenAt: "desc" },
    })
    if (!rows.length) return null
    return rows.flatMap((row) => {
      const listed = buildListedJob({
        externalId: row.externalId ?? undefined,
        title: row.title,
        companyName: target.companyName,
        locationText: row.locationText ?? undefined,
        employmentType: row.employmentType ?? undefined,
        workplaceType: row.workplaceType,
        descriptionText: row.descriptionText,
        salaryMin: row.salaryMin ?? undefined,
        salaryMax: row.salaryMax ?? undefined,
        salaryCurrency: row.salaryCurrency ?? undefined,
        publishedAt: row.publishedAt ?? undefined,
        originalUrl: row.canonicalUrl || row.originalUrl,
        sourceType: target.provider,
        sourceBoardId: boardId,
        needsHydration: false,
        llmOptOut: row.llmOptOut,
        variants: Array.isArray(row.variants) ? (row.variants as ListedJob["variants"]) : undefined,
      })
      return listed ? [listed] : []
    })
  } catch {
    return null
  }
}

export async function listCareerSite(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  if (boardId.toLowerCase() === "jobs.allegro.eu") {
    return {
      jobs: [],
      proven: false,
      companyName: companyName || "Allegro",
      note: "Allegro jobs are on careers.allegro.eu. jobs.allegro.eu has no inventory, and career55.sapsf.eu stays link-only.",
    }
  }
  const target = targetFor(boardId, companyName)
  if (!target) return { jobs: [], proven: false, note: "No career-site policy for this board" }
  const cached = await loadCached(target, boardId)
  if (cached) {
    return {
      jobs: cached,
      proven: true,
      companyName: target.companyName,
      note: `Served ${cached.length} stored jobs. Sitemap refresh is daily.`,
    }
  }

  const robotsUrl = `https://${target.host}/robots.txt`
  const robots = await readRobots(robotsUrl, http)
  if (
    robots.note &&
    (robots.status === 401 || robots.status === 403 || robots.status === 503 || robots.status === 0)
  ) {
    return { jobs: [], proven: false, companyName: target.companyName, note: robots.note }
  }
  if (robots.rules.crawlDelaySec && robots.rules.crawlDelaySec > 5) {
    noteHostInterval(target.host, robots.rules.crawlDelaySec * 1000)
  }
  const notes: string[] = []
  if (target.blockedHost) {
    const blocked = await readRobots(`https://${target.blockedHost}/robots.txt`, http)
    if (blocked.note) notes.push(blocked.note)
    else if (!robotsAllows(blocked.rules, "/")) {
      notes.push(`${target.blockedHost} robots.txt disallows /. Job pages there are not fetched.`)
    }
  }

  if (target.discoverFeed || target.mode === "feed") {
    const feed = await tryFeed(target, http, robots.rules)
    if (feed) {
      feed.note = [feed.note, ...notes].filter(Boolean).join(" ").slice(0, 500)
      return feed
    }
    if (target.mode === "feed") {
      return {
        jobs: [],
        proven: false,
        companyName: target.companyName,
        note: ["No jobs.feed.json DataFeed was published.", ...notes].join(" ").slice(0, 500),
      }
    }
  }

  if (target.mode === "listing" || target.mode === "search") {
    const listing = await readListing(target, http, robots.rules)
    listing.note = [listing.note, ...notes].filter(Boolean).join(" ").slice(0, 500)
    return listing
  }

  const sitemapSeeds = [
    ...new Set([
      ...(robots.rules.sitemaps || []),
      ...(target.sitemapUrl ? [target.sitemapUrl] : []),
    ]),
  ]
  const entries: SitemapEntry[] = []
  for (const seed of sitemapSeeds.slice(0, 6)) {
    try {
      entries.push(...(await collectSitemaps(seed, http, robots.rules)))
    } catch (error) {
      if (error instanceof UnsafeUrlError) notes.push(error.message)
    }
  }
  const urls = jobUrls(entries, target)
  if (!urls.length && target.listingUrl) {
    const listing = await readListing(target, http, robots.rules)
    listing.note = [listing.note, ...notes].filter(Boolean).join(" ").slice(0, 500)
    return listing
  }
  const poland = urls.filter((entry) => entry.loc.toLowerCase().includes("/poland/")).length
  const limit = detailLimit()
  const parsed: ListedJob[] = []
  let blockedStreak = 0
  for (const entry of urls.slice(0, limit)) {
    try {
      const job = await fetchJobPage(entry, http, target, robots.rules)
      if (job) {
        parsed.push(job)
        blockedStreak = 0
      }
    } catch (error) {
      if (error instanceof UnsafeUrlError) {
        notes.push(error.message)
        break
      }
      blockedStreak += 1
      if (blockedStreak >= 3) {
        notes.push("Stopped after repeated fetch failures. Not bypassing a bot wall.")
        break
      }
    }
  }

  let cxsNote = ""
  if (target.platform === "workday" && urls.length >= 100) {
    const extra = await cxsPoland(target, http)
    const seen = new Set(parsed.map((job) => job.originalUrl))
    for (const job of extra) {
      if (!seen.has(job.originalUrl)) parsed.push(job)
    }
    cxsNote = ` Sitemap looked capped (${urls.length} URLs), so a Poland cxs query added ${extra.length} titles.`
  }

  const jobs = target.platform === "successfactors" ? pairContractVariants(parsed) : parsed
  const caution = target.countCaution ? ` ${target.countCaution}` : ""
  notes.unshift(
    `${urls.length} job URLs in the sitemap${
      poland ? ` (${poland} under /Poland/)` : ""
    }.${caution} Fetched ${parsed.length} pages.${cxsNote}`
  )
  return {
    jobs,
    proven: true,
    companyName: target.companyName,
    note: notes.join(" ").slice(0, 500),
  }
}

export async function hydrateCareer(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  let host = ""
  try {
    host = new URL(job.originalUrl).hostname
  } catch {
    return job
  }
  const slot = await takeDetailSlot(host)
  if (!slot) return job
  const response = await http.get(job.originalUrl, { accept: "text/html", maxBytes: 1_500_000 })
  if (response.status >= 400) return job
  if (job.sourceType === "SUCCESSFACTORS") {
    return (
      parseSuccessFactorsJob(
        response.body,
        response.url || job.originalUrl,
        job.companyName,
        job.sourceBoardId
      ) ?? job
    )
  }
  const found = parseJsonLdJobs(response.body, response.url || job.originalUrl, job.companyName, {
    provider: "career",
    sourceType: job.sourceType,
    boardId: job.sourceBoardId,
  })
  return found[0] ? { ...job, ...found[0], variants: job.variants } : job
}
