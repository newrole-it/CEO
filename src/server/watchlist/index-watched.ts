/**
 * Index runs for watched companies. ATS boards go through the normal indexer;
 * company sites with JSON-LD are read here, a few pages a day, inside the host cap.
 */
import type { CareerPage, Company, SourceType } from "@prisma/client"
import db from "db"
import type { SeedBoard } from "config/seed-boards"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { detailFetchesRemaining, takeDetailSlot } from "src/server/crawler/budget"
import { indexBoard } from "src/server/index/run"
import { nextCrawlAt, pickWatchedPage, SOURCE_RETRY_MS } from "src/server/index/schedule"
import { knownCanonicals, noteIndexFailure, storeBoardInventory } from "src/server/index/store"
import { safeCanonicalUrl } from "src/server/jobs/dedupe"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { hostOf, jobLinks } from "src/server/discovery/careers-detect"
import { createRobotsCache, politeGet } from "src/server/discovery/polite-fetch"

/** Job pages read per watched site per run. The 200/day host cap still applies. */
export const SITE_BATCH = 25

const ADAPTER_PROVIDERS = new Set<SourceType>([
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "SMARTRECRUITERS",
  "TRAFFIT",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "PINPOINT",
  "BREEZY",
  "BAMBOOHR",
  "SUCCESSFACTORS",
  "WORKDAY",
  "CAREER_SITE",
])

export function isSitePage(page: { provider: string; providerBoardId: string | null }): boolean {
  return page.provider === "GENERIC_HTML" && Boolean(page.providerBoardId?.startsWith("site:"))
}

export function isIndexablePage(page: {
  provider: SourceType
  providerBoardId: string | null
  enabled: boolean
}): boolean {
  if (!page.enabled || !page.providerBoardId) return false
  return ADAPTER_PROVIDERS.has(page.provider) || isSitePage(page)
}

export function boardFromPage(page: CareerPage, company: Company): SeedBoard {
  return {
    provider: page.provider,
    boardId: page.providerBoardId ?? "",
    companyName: company.name,
    careersUrl: page.url,
    apiUrl: page.url,
    openJobsAtCheck: 0,
    plLocatedJobs: 0,
    identityConfirmed: true,
    priority: 0,
  }
}

/** Read a company careers page and its job pages for schema.org JobPosting data. */
export async function refreshCareerSite(
  page: CareerPage,
  company: Company,
  http: HttpClient = createHttpClient(),
  now = new Date()
): Promise<"indexed" | "failed"> {
  const board = {
    provider: page.provider,
    boardId: page.providerBoardId ?? "",
    companyName: company.name,
    careersUrl: page.url,
  }
  const robots = createRobotsCache()
  const listing = await politeGet(page.url, http, robots)
  if (!listing.ok) {
    await noteIndexFailure(board, now, new Date(now.getTime() + SOURCE_RETRY_MS), listing.reason)
    return "failed"
  }
  const html = listing.response.body
  const pageUrl = listing.response.url || page.url
  const jobs: ListedJob[] = parseJsonLdJobs(html, pageUrl, company.name)
  const links = jobLinks(html, pageUrl, 200)
  const known = await knownCanonicals(page.id)
  const host = hostOf(pageUrl) ?? ""
  const remaining = await detailFetchesRemaining(host)
  let fetched = 0
  let budgetExhausted = false
  for (const link of links) {
    if (known.has(safeCanonicalUrl(link))) continue
    if (fetched >= Math.min(SITE_BATCH, remaining) || !(await takeDetailSlot(host))) {
      budgetExhausted = true
      break
    }
    fetched += 1
    const detail = await politeGet(link, http, robots)
    if (!detail.ok) continue
    jobs.push(...parseJsonLdJobs(detail.response.body, detail.response.url || link, company.name))
  }
  if (!jobs.length && !known.size) {
    await noteIndexFailure(
      board,
      now,
      new Date(now.getTime() + SOURCE_RETRY_MS),
      "No schema.org JobPosting data on the careers pages"
    )
    return "failed"
  }
  const stamped = jobs.map((job) => ({
    ...job,
    companyName: company.name,
    sourceType: "GENERIC_HTML" as const,
    sourceBoardId: board.boardId,
  }))
  const complete = !budgetExhausted
  await storeBoardInventory({
    board,
    listed: {
      jobs: stamped,
      proven: true,
      companyName: company.name,
      listedCount: Math.max(links.length, stamped.length),
      complete,
      budgetExhausted,
      coveredUrls: complete ? [...links.map(safeCanonicalUrl), ...known] : undefined,
      note: `Company site, JSON-LD. ${fetched} job pages read this run.`,
    },
    now,
    nextCheckAt: nextCrawlAt(now, complete, budgetExhausted),
  })
  console.log(`Indexed watched site ${company.name}: ${stamped.length} offers, ${fetched} pages`)
  return "indexed"
}

/** One watched page, by id. Used by the INDEX_WATCHED task. */
export async function indexWatchedPage(
  careerPageId: string,
  http: HttpClient = createHttpClient(),
  now = new Date()
): Promise<"indexed" | "unchanged" | "skipped" | "failed"> {
  const page = await db.careerPage.findUnique({
    where: { id: careerPageId },
    include: { company: true },
  })
  if (!page || !isIndexablePage(page)) return "skipped"
  let result: "indexed" | "unchanged" | "skipped" | "failed"
  try {
    result = isSitePage(page)
      ? await refreshCareerSite(page, page.company, http, now)
      : await indexBoard(boardFromPage(page, page.company), http, now)
  } catch (error) {
    console.error("Watched index failed", error instanceof Error ? error.message : error)
    result = "failed"
  }
  const after = await db.careerPage.findUnique({ where: { id: page.id } })
  if (after && (!after.nextCheckAt || after.nextCheckAt <= now) && result !== "indexed") {
    // Never leave a page due right away after a skip or crash: the loop would spin on it.
    await db.careerPage.update({
      where: { id: page.id },
      data: { nextCheckAt: new Date(now.getTime() + SOURCE_RETRY_MS), lastCheckedAt: now },
    })
  }
  return result
}

/** The next due watched page, ahead of the seed queue. False when none is due. */
export async function indexNextWatched(
  http: HttpClient = createHttpClient(),
  now = new Date()
): Promise<boolean> {
  const pages = await db.careerPage.findMany({
    where: {
      enabled: true,
      providerBoardId: { not: null },
      company: { watchers: { some: {} } },
      OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: now } }],
    },
    select: {
      id: true,
      provider: true,
      providerBoardId: true,
      enabled: true,
      nextCheckAt: true,
      lastSuccessfulFetchAt: true,
      company: { select: { _count: { select: { watchers: true } } } },
    },
    take: 200,
  })
  const slots = pages
    .filter((page) => isIndexablePage(page))
    .map((page) => ({ ...page, watchers: page.company._count.watchers }))
  const picked = pickWatchedPage(slots, now)
  if (!picked) return false
  await indexWatchedPage(picked.id, http, now)
  return true
}
