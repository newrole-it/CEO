/**
 * Find where a company publishes its offers. Network only, no database writes.
 * Order: a known ATS URL, then the page itself (ATS markers, JSON-LD), then
 * careers links at most two hops away, then a job sitemap. Everything else is link-only.
 */
import { compactName, namesAgree } from "src/server/adapters/blocked"
import { isSlugAlias, tenantHost } from "src/server/adapters/hosts"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { adapterFor, type LiveAts } from "src/server/adapters/registry"
import type { BoardList } from "src/server/adapters/types"
import { takeDetailSlot } from "src/server/crawler/budget"
import { parseSitemap } from "src/server/crawler/sitemap"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob, SourceType } from "src/shared/schemas"
import { classifyHit, detectBoard, workableSlugFromHtml } from "src/server/discovery/boards"
import {
  companyDomain,
  findAtsMarkers,
  findCareersLinks,
  hostOf,
  isAggregatorHost,
  jobLinks,
  looksLikeJobPath,
  plausibleBoard,
  siteName,
} from "src/server/discovery/careers-detect"
import {
  createRobotsCache,
  policyFor,
  politeGet,
  type RobotsCache,
} from "src/server/discovery/polite-fetch"
import type { WebHit } from "src/server/discovery/web-search"

export type Resolution =
  | {
      kind: "ats"
      provider: LiveAts
      boardId: string
      companyName: string
      careersUrl: string
      domain: string | null
      openJobs: number
      note?: string
    }
  | {
      kind: "career-site"
      careersUrl: string
      companyName: string
      domain: string | null
      jobs: ListedJob[]
    }
  | { kind: "link-only"; careersUrl: string; companyName: string | null; domain: string | null; reason: string }
  | { kind: "not-found"; message: string }

export type ResolveDeps = {
  http: HttpClient
  /** Web search. Omitted or provider "none" means a name alone cannot be resolved. */
  search?: (query: string) => Promise<{ provider: string; hits: WebHit[] }>
  robots?: RobotsCache
  takeSlot?: (host: string) => Promise<boolean>
}

/** Pages read while resolving one company, robots.txt excluded. */
export const MAX_PAGES = 8
const MAX_BOARD_CHECKS = 3

/** The public board page for a provider and board id. */
export function boardUrl(provider: SourceType, boardId: string): string {
  if (provider === "GREENHOUSE") return `https://job-boards.greenhouse.io/${boardId}`
  if (provider === "LEVER") {
    if (boardId.toLowerCase().startsWith("eu:")) return `https://jobs.eu.lever.co/${boardId.slice(3)}`
    return `https://jobs.lever.co/${boardId}`
  }
  if (provider === "ASHBY") return `https://jobs.ashbyhq.com/${boardId}`
  if (provider === "WORKABLE") return `https://apply.workable.com/${boardId}/`
  if (provider === "SMARTRECRUITERS") return `https://jobs.smartrecruiters.com/${boardId}`
  if (provider === "TEAMTAILOR") return `https://${tenantHost(boardId, "teamtailor.com")}/jobs`
  if (provider === "RECRUITEE") return `https://${tenantHost(boardId, "recruitee.com")}/`
  if (provider === "PERSONIO") return `https://${tenantHost(boardId, "jobs.personio.de")}/`
  if (provider === "TRAFFIT") return `https://${tenantHost(boardId, "traffit.com")}/career/`
  if (provider === "PINPOINT") return `https://${tenantHost(boardId, "pinpointhq.com")}/`
  if (provider === "BREEZY") return `https://${tenantHost(boardId, "breezy.hr")}/`
  if (provider === "BAMBOOHR") return `https://${tenantHost(boardId, "bamboohr.com")}/careers`
  return `https://${boardId.replace(/^https?:\/\//, "")}/`
}

/** Adds https:// to a bare domain. Returns null for anything that is not a web URL. */
export function normalizeInputUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!url.hostname.includes(".")) return null
    url.hash = ""
    return url.toString()
  } catch {
    return null
  }
}

/** Do the board, the expected name, and the company's domain point at the same company? */
export function boardAgrees(
  board: { boardId: string; companyName?: string },
  expected: { name?: string | null; domain?: string | null }
): boolean {
  const slug = board.boardId.replace(/^eu:/, "").split(".")[0] ?? board.boardId
  const label = expected.domain ? expected.domain.split(".")[0] ?? "" : ""
  const names = [expected.name, label].filter((value): value is string => Boolean(value))
  for (const name of names) {
    if (isSlugAlias(name, board.boardId)) return true
    if (board.companyName && namesAgree(name, board.companyName)) return true
    const left = compactName(name)
    const right = compactName(slug)
    if (left.length >= 3 && right.length >= 3 && (left.includes(right) || right.includes(left))) {
      return true
    }
  }
  return false
}

type Ctx = {
  deps: ResolveDeps
  robots: RobotsCache
  pages: number
  boardChecks: number
  linkOnly: { url: string; reason: string } | null
  name: string | null
  domain: string | null
  careersUrl: string | null
  visited: Set<string>
  boards: Set<string>
  /** A real board with zero offers. Used only when the site itself lists no job pages. */
  emptyBoard: Resolution | null
  sawJobLinks: boolean
}

function pageKey(url: string): string {
  return url.replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase()
}

async function checkBoard(
  ctx: Ctx,
  provider: LiveAts,
  boardId: string,
  strict: boolean
): Promise<Resolution | null> {
  const key = `${provider}:${boardId.toLowerCase()}`
  if (ctx.boards.has(key) || ctx.boardChecks >= MAX_BOARD_CHECKS) return null
  if (!plausibleBoard({ provider, boardId })) return null
  ctx.boards.add(key)
  ctx.boardChecks += 1
  let listed: BoardList
  try {
    listed = await adapterFor(provider).list(
      boardId,
      ctx.deps.http,
      strict ? ctx.name ?? undefined : undefined
    )
  } catch {
    return null
  }
  // Only an explicit "no open jobs" counts as a real, empty board. "Not found" and
  // "unproven" (e.g. SmartRecruiters/Workable answering for any slug) never do.
  const empty = listed.jobs.length === 0 && /has no open jobs/i.test(listed.note || "")
  if (!listed.proven && !empty) return null
  if (listed.jobs.length === 0 && !empty) return null
  if (strict && !boardAgrees({ boardId, companyName: listed.companyName }, ctx)) return null
  const companyName = listed.companyName || ctx.name || boardId.replace(/^eu:/, "")
  const found: Resolution = {
    kind: "ats",
    provider,
    boardId,
    companyName,
    careersUrl: boardUrl(provider, boardId),
    domain: ctx.domain,
    openJobs: 0,
    note: listed.note || "The board has no open offers right now",
  }
  if (empty) {
    // An empty feed proves nothing yet: the site may list its offers elsewhere.
    if (!strict) ctx.emptyBoard = ctx.emptyBoard ?? found
    return null
  }
  return {
    kind: "ats",
    provider,
    boardId,
    companyName,
    careersUrl: boardUrl(provider, boardId),
    domain: ctx.domain,
    openJobs: listed.jobs.length,
    note: listed.note,
  }
}

async function fromBoardUrl(ctx: Ctx, url: string, strict: boolean): Promise<Resolution | null> {
  const hit = classifyHit(url)
  if (hit.kind === "ats") return checkBoard(ctx, hit.provider as LiveAts, hit.boardId, strict)
  if (hit.kind === "workable-shortcode" && ctx.pages < MAX_PAGES) {
    ctx.pages += 1
    const page = await politeGet(url, ctx.deps.http, ctx.robots)
    const slug = page.ok ? workableSlugFromHtml(page.response.body) : null
    return slug ? checkBoard(ctx, "WORKABLE", slug, strict) : null
  }
  return null
}

async function readPage(ctx: Ctx, url: string, hop: number): Promise<Resolution | null> {
  if (ctx.pages >= MAX_PAGES) return null
  const direct = detectBoard(url)
  if (direct) return fromBoardUrl(ctx, url, false)
  if (ctx.visited.has(pageKey(url))) return null
  ctx.visited.add(pageKey(url))
  const policy = policyFor(url)
  if (!policy.allow) {
    if (policy.linkOnly && !isAggregatorHost(hostOf(url) ?? "")) {
      ctx.linkOnly = ctx.linkOnly ?? { url, reason: policy.reason }
    }
    return null
  }
  ctx.pages += 1
  const page = await politeGet(url, ctx.deps.http, ctx.robots)
  if (!page.ok) {
    if (page.linkOnly) ctx.linkOnly = ctx.linkOnly ?? { url, reason: page.reason }
    return null
  }
  const html = page.response.body
  const finalUrl = page.response.url || url
  ctx.visited.add(pageKey(finalUrl))
  ctx.name = ctx.name ?? siteName(html)
  ctx.domain = ctx.domain ?? companyDomain(finalUrl)

  for (const marker of findAtsMarkers(html, finalUrl)) {
    if (marker.kind === "link-only") {
      ctx.linkOnly = ctx.linkOnly ?? {
        url: marker.url,
        reason: `${marker.vendor} is read as a link only`,
      }
      continue
    }
    const embedded = !/^https?:/.test(marker.evidence)
    const found = await checkBoard(ctx, marker.provider as LiveAts, marker.boardId, !embedded && hop > 1)
    if (found) return found
  }

  const jobs = parseJsonLdJobs(html, finalUrl, ctx.name ?? undefined)
  if (jobs.length) {
    return careerSite(ctx, finalUrl, jobs)
  }

  const details = jobLinks(html, finalUrl, 5)
  if (details.length) ctx.sawJobLinks = true
  if (details.length && !ctx.careersUrl) ctx.careersUrl = finalUrl
  const links = findCareersLinks(html, finalUrl).filter((link) => {
    if (ctx.visited.has(pageKey(link.url))) return false
    try {
      // Single offers are read by firstJobPage under the detail cap, not walked as hops.
      return Boolean(detectBoard(link.url)) || !looksLikeJobPath(new URL(link.url).pathname)
    } catch {
      return false
    }
  })
  if (hop < 2) {
    for (const link of links.slice(0, 3)) {
      if (detectBoard(link.url)) {
        const found = await fromBoardUrl(ctx, link.url, false)
        if (found) return found
        continue
      }
      ctx.careersUrl = ctx.careersUrl ?? link.url
      const found = await readPage(ctx, link.url, hop + 1)
      if (found) return found
    }
  }
  if (details.length) {
    const detail = await firstJobPage(ctx, details)
    if (detail) return detail
  }
  return null
}

function careerSite(ctx: Ctx, url: string, jobs: ListedJob[]): Resolution {
  const listing = ctx.careersUrl && !looksLikeJobPath(new URL(ctx.careersUrl).pathname)
  return {
    kind: "career-site",
    careersUrl: listing ? ctx.careersUrl! : url,
    companyName: ctx.name || jobs.find((job) => job.companyName)?.companyName || ctx.domain || "",
    domain: ctx.domain,
    jobs,
  }
}

/** Read up to two job pages for JSON-LD. Each one uses a detail slot of the 200/day host cap. */
async function firstJobPage(ctx: Ctx, urls: string[]): Promise<Resolution | null> {
  const take = ctx.deps.takeSlot ?? takeDetailSlot
  for (const url of urls.slice(0, 2)) {
    if (ctx.pages >= MAX_PAGES) return null
    if (ctx.visited.has(pageKey(url))) continue
    const host = hostOf(url)
    if (!host || !(await take(host))) return null
    ctx.visited.add(pageKey(url))
    ctx.pages += 1
    const page = await politeGet(url, ctx.deps.http, ctx.robots)
    if (!page.ok) continue
    const jobs = parseJsonLdJobs(page.response.body, page.response.url || url, ctx.name ?? undefined)
    if (jobs.length) return careerSite(ctx, url, jobs)
  }
  return null
}

/** Job URLs from the site's sitemap (robots.txt Sitemap lines, else /sitemap.xml). */
async function fromSitemap(ctx: Ctx, siteUrl: string): Promise<Resolution | null> {
  let origin: string
  try {
    origin = new URL(siteUrl).origin
  } catch {
    return null
  }
  const declared = [...ctx.robots.values()].flatMap((entry) => entry.rules.sitemaps)
  const queue = [
    ...new Set([...declared.filter((item) => item.startsWith(origin)), `${origin}/sitemap.xml`]),
  ].slice(0, 2)
  for (let index = 0; index < queue.length && index < 3; index++) {
    const sitemapUrl = queue[index]!
    if (ctx.pages >= MAX_PAGES) return null
    ctx.pages += 1
    const page = await politeGet(sitemapUrl, ctx.deps.http, ctx.robots, {
      accept: "application/xml,text/xml",
      maxBytes: 4_000_000,
    })
    if (!page.ok) continue
    const parsed = parseSitemap(page.response.body)
    const jobs = parsed.urls.map((entry) => entry.loc).filter((loc) => {
      try {
        return looksLikeJobPath(new URL(loc).pathname)
      } catch {
        return false
      }
    })
    if (jobs.length) {
      const found = await firstJobPage(ctx, jobs)
      if (found) return found
    }
    const child = parsed.children.find((loc) => /job|career|kariera|oferty/i.test(loc))
    if (child && !queue.includes(child)) queue.push(child)
  }
  return null
}

function newCtx(deps: ResolveDeps, name: string | null): Ctx {
  return {
    deps,
    robots: deps.robots ?? createRobotsCache(),
    pages: 0,
    boardChecks: 0,
    linkOnly: null,
    name,
    domain: null,
    careersUrl: null,
    visited: new Set(),
    boards: new Set(),
    emptyBoard: null,
    sawJobLinks: false,
  }
}

/** Resolve one URL: ATS board, page markers, careers links, sitemap. */
export async function resolveUrl(
  raw: string,
  deps: ResolveDeps,
  name?: string | null
): Promise<Resolution> {
  const url = normalizeInputUrl(raw)
  if (!url) return { kind: "not-found", message: "That does not look like a web address." }
  const ctx = newCtx(deps, name?.trim() || null)
  const host = hostOf(url) ?? ""
  if (isAggregatorHost(host)) {
    return {
      kind: "not-found",
      message:
        "LinkedIn and job boards are not read. Paste the company's own website or careers page.",
    }
  }
  if (detectBoard(url) || classifyHit(url).kind === "workable-shortcode") {
    const found = await fromBoardUrl(ctx, url, false)
    if (found) return found
    if (ctx.emptyBoard) return ctx.emptyBoard
    return { kind: "not-found", message: "That job board did not answer or is not a known board." }
  }
  ctx.domain = companyDomain(url)
  const found = await readPage(ctx, url, 0)
  if (found) return found
  const viaSitemap = await fromSitemap(ctx, url)
  if (viaSitemap) return viaSitemap
  if (ctx.emptyBoard && !ctx.sawJobLinks) return ctx.emptyBoard
  const link = ctx.linkOnly
  return {
    kind: "link-only",
    careersUrl: link?.url ?? ctx.careersUrl ?? url,
    companyName: ctx.name,
    domain: ctx.domain,
    reason:
      link?.reason ??
      "No ATS board or structured job data was found. The careers page is kept as a link.",
  }
}

/** Search hits that could be this company's own site or board, best first. */
export function rankSearchHits(name: string, hits: WebHit[]): string[] {
  const compact = compactName(name)
  const scored: Array<{ url: string; score: number }> = []
  for (const hit of hits) {
    const host = hostOf(hit.url)
    if (!host || isAggregatorHost(host)) continue
    const board = detectBoard(hit.url)
    if (board) {
      if (boardAgrees({ boardId: board.boardId }, { name })) scored.push({ url: hit.url, score: 5 })
      continue
    }
    const label = compactName(companyDomain(hit.url)?.split(".")[0] ?? "")
    if (!label || !compact) continue
    const agree = label === compact || (label.length >= 4 && (compact.includes(label) || label.includes(compact)))
    if (!agree) continue
    let score = 3
    try {
      if (/kariera|career|jobs|praca|join/i.test(new URL(hit.url).pathname + host)) score += 1
    } catch {
      /* ignore */
    }
    scored.push({ url: hit.url, score })
  }
  return [...new Set(scored.sort((a, b) => b.score - a.score).map((item) => item.url))]
}

/** A name alone needs web search. Without a provider the answer explains what to paste instead. */
export async function resolveName(name: string, deps: ResolveDeps): Promise<Resolution> {
  const clean = name.trim()
  if (!clean) return { kind: "not-found", message: "Give a company name or its website." }
  if (!deps.search) {
    return {
      kind: "not-found",
      message: `Web search is not configured, so "${clean}" cannot be looked up by name. Paste the company's website or careers page instead.`,
    }
  }
  let hits: WebHit[] = []
  try {
    const result = await deps.search(`"${clean.replace(/"/g, "")}" kariera OR careers OR jobs`)
    if (result.provider === "none") {
      return {
        kind: "not-found",
        message: `Web search is not configured, so "${clean}" cannot be looked up by name. Paste the company's website or careers page instead.`,
      }
    }
    hits = result.hits
  } catch (error) {
    return {
      kind: "not-found",
      message: `Search failed (${error instanceof Error ? error.message : "error"}). Paste the company's website instead.`,
    }
  }
  const robots = deps.robots ?? createRobotsCache()
  for (const url of rankSearchHits(clean, hits).slice(0, 2)) {
    const ctx = newCtx({ ...deps, robots }, clean)
    if (detectBoard(url)) {
      const found = await fromBoardUrl(ctx, url, true)
      if (found) return found
      continue
    }
    const found = await resolveUrl(url, { ...deps, robots }, clean)
    if (found.kind !== "not-found") return found
  }
  return {
    kind: "not-found",
    message: `No official site or careers page for "${clean}" was found. Paste its website to watch it.`,
  }
}
