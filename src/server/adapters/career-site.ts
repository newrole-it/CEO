import db from "db"
import type { HttpClient } from "src/server/security/safe-fetch"
import { noteHostInterval } from "src/server/security/safe-fetch"
import { UnsafeUrlError } from "src/server/security/url-safety"
import type { ListedJob, SourceType } from "src/shared/schemas"
import { takeDetailSlot } from "src/server/crawler/budget"
import { emptyRobots, parseRobots, robotsAllows, type RobotsRules } from "src/server/crawler/robots"
import { parseSitemap, type SitemapEntry } from "src/server/crawler/sitemap"
import { pairContractVariants } from "src/server/crawler/variants"
import { parseJsonLdJobs } from "./jsonld"
import { buildListedJob } from "./parse"
import { parseSuccessFactorsJob } from "./successfactors"
import type { BoardList } from "./types"

type Platform = "successfactors" | "workday"

type CareerTarget = {
  platform: Platform
  provider: SourceType
  companyName: string
  siteUrl: string
  host: string
  sitemapUrl?: string
  blockedHost?: string
  cxs?: { tenant: string; cluster: string; site: string }
}

const KNOWN: Record<string, Omit<CareerTarget, "provider">> = {
  "jobs.gft.com": {
    platform: "successfactors",
    companyName: "GFT",
    siteUrl: "https://jobs.gft.com/",
    host: "jobs.gft.com",
    sitemapUrl: "https://jobs.gft.com/sitemap.xml",
  },
  "jobs.allegro.eu": {
    platform: "successfactors",
    companyName: "Allegro",
    siteUrl: "https://jobs.allegro.eu/",
    host: "jobs.allegro.eu",
    sitemapUrl: "https://jobs.allegro.eu/sitemap_index.xml",
    blockedHost: "career55.sapsf.eu",
  },
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
    cxs: { tenant, cluster, site },
  }
}

function targetFor(boardId: string, companyName?: string): CareerTarget | null {
  const known = KNOWN[boardId.toLowerCase()]
  if (known) {
    return { ...known, provider: "SUCCESSFACTORS", companyName: companyName || known.companyName }
  }
  return workdayTarget(boardId, companyName)
}

function detailLimit(): number {
  const parsed = Number(process.env.CAREER_DETAIL_LIMIT || 40)
  if (!Number.isFinite(parsed) || parsed < 0) return 40
  return Math.min(200, parsed)
}

function rankUrl(loc: string): number {
  const lower = loc.toLowerCase()
  if (lower.includes("principal-solution-architect")) return 0
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
  const response = await http.get(start, {
    accept: "application/xml, text/xml",
    maxBytes: 5_000_000,
  })
  if (response.status >= 400) return []
  const parsed = parseSitemap(response.body)
  const urls = [...parsed.urls]
  for (const child of parsed.children.slice(0, 8)) {
    urls.push(...(await collectSitemaps(child, http, rules, depth + 1)))
  }
  return urls
}

function jobUrls(entries: SitemapEntry[]): SitemapEntry[] {
  const seen = new Set<string>()
  const jobs: SitemapEntry[] = []
  for (const entry of entries) {
    if (!/\/job\//i.test(entry.loc)) continue
    if (seen.has(entry.loc)) continue
    seen.add(entry.loc)
    jobs.push(entry)
  }
  return jobs.sort((a, b) => rankUrl(a.loc) - rankUrl(b.loc) || a.loc.localeCompare(b.loc))
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
  if (url.hostname.toLowerCase() !== target.host) return null
  if (url.searchParams.get("loginFlowRequired") === "true") return null
  if (!robotsAllows(rules, url.pathname)) return null
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
  if (target.platform === "successfactors") {
    return parseSuccessFactorsJob(
      response.body,
      response.url || url.toString(),
      target.companyName,
      target.siteUrl && target.host
    )
  }
  const found = parseJsonLdJobs(response.body, response.url || url.toString(), target.companyName, {
    provider: "career",
    sourceType: "WORKDAY",
    boardId: target.cxs
      ? `${target.cxs.tenant}/wd${target.cxs.cluster}/${target.cxs.site}`
      : target.host,
  })
  return found[0] ?? null
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
        sourceBoardId: `${tenant}/wd${cluster}/${site}`,
        needsHydration: true,
      })
      if (listed) jobs.push(listed)
    }
  }
  return jobs
}

async function loadCached(target: CareerTarget, boardId: string): Promise<ListedJob[] | null> {
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

  const sitemapSeeds = [
    ...(robots.rules.sitemaps || []),
    ...(target.sitemapUrl ? [target.sitemapUrl] : []),
  ]
  const entries: SitemapEntry[] = []
  for (const seed of sitemapSeeds.slice(0, 6)) {
    try {
      entries.push(...(await collectSitemaps(seed, http, robots.rules)))
    } catch (error) {
      if (error instanceof UnsafeUrlError) notes.push(error.message)
    }
  }
  const urls = jobUrls(entries)
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
  notes.unshift(
    `${urls.length} job URLs in the sitemap${
      poland ? ` (${poland} under /Poland/)` : ""
    }. Fetched ${parsed.length} pages.${cxsNote}`
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
