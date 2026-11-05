/**
 * The catalog of outside boards: import candidates, check each on its platform, store the IT offers
 * of the ones that pass, and check them again on every later read.
 */
import db from "db"
import { loadSeedBoards } from "config/seed-boards"
import { createRobotsCache, type RobotsCache } from "@newrole/offers/polite"
import { settleApiList } from "src/server/index/run"
import { nextCrawlAt } from "src/server/index/schedule"
import { storeBoardInventory } from "src/server/index/store"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { boardUrl } from "src/server/watchlist/resolve"
import type { SourceType } from "src/shared/schemas"
import { CC_LATEST, discoverBoards } from "./commoncrawl"
import { candidatesFromYaml, freehireFileUrl, FREEHIRE_FILES, FREEHIRE_ORIGIN } from "./freehire"
import { verifyBoard, type BoardVerdict, type CatalogReason } from "./verify"

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * When a board is read again. A verified board follows the daily crawl; a board that is not hiring
 * IT now is looked at weekly; a transient failure retries in six hours. A board that is not the
 * company, not a company, or not on the platform is not read again.
 */
export function nextCatalogCheck(
  now: Date,
  status: "verified" | "rejected",
  reason?: CatalogReason
): Date | null {
  if (status === "verified") return nextCrawlAt(now, true, false)
  if (reason === "error") return new Date(now.getTime() + 6 * 60 * 60 * 1000)
  if (reason === "no_jobs" || reason === "no_it_jobs" || reason === "no_country") {
    return new Date(now.getTime() + 7 * DAY_MS)
  }
  return null
}

/** Boards this app already reads from its seed list or a watched company. */
async function knownBoardKeys(): Promise<Set<string>> {
  const keys = new Set(
    loadSeedBoards().map((board) => `${board.provider}:${board.boardId.toLowerCase()}`)
  )
  const pages = await db.careerPage.findMany({
    where: { company: { watchers: { some: {} } } },
    select: { provider: true, providerBoardId: true },
  })
  for (const page of pages) {
    if (page.providerBoardId) keys.add(`${page.provider}:${page.providerBoardId.toLowerCase()}`)
  }
  return keys
}

export type ImportSummary = {
  file: string
  read: number
  added: number
  known: number
  existing: number
}

/** Reads freehire's files and adds every new board as a candidate. Nothing is crawled here. */
export async function importFreehire(args: {
  files?: string[]
  readFile?: (file: string) => Promise<string>
}): Promise<ImportSummary[]> {
  const files = args.files?.length ? args.files : Object.keys(FREEHIRE_FILES)
  const known = await knownBoardKeys()
  const read =
    args.readFile ??
    (async (file: string) => {
      const response = await fetch(freehireFileUrl(file), {
        headers: { "User-Agent": "NewRoleBot/0.1 (+https://newrole.it/bot)" },
        signal: AbortSignal.timeout(60_000),
      })
      if (!response.ok) throw new Error(`${file}.yml returned ${response.status}`)
      return response.text()
    })
  const summaries: ImportSummary[] = []
  for (const file of files) {
    if (!FREEHIRE_FILES[file]) throw new Error(`Unknown freehire file ${file}`)
    const candidates = candidatesFromYaml(file, await read(file))
    const fresh = candidates.filter(
      (item) => !known.has(`${item.provider}:${item.providerBoardId.toLowerCase()}`)
    )
    let added = 0
    for (let start = 0; start < fresh.length; start += 1000) {
      const result = await db.catalogBoard.createMany({
        data: fresh.slice(start, start + 1000).map((item) => ({
          provider: item.provider,
          providerBoardId: item.providerBoardId,
          listedName: item.listedName,
          origin: FREEHIRE_ORIGIN,
        })),
        skipDuplicates: true,
      })
      added += result.count
    }
    summaries.push({
      file,
      read: candidates.length,
      added,
      known: candidates.length - fresh.length,
      existing: fresh.length - added,
    })
  }
  return summaries
}

export type DiscoverSummary = { provider: SourceType; blocks: number; found: number; added: number }

/**
 * Boards found in Common Crawl's URL index, added as candidates. A board already in the catalog,
 * the seed list or a watched company is left alone. Common Crawl gives no company name, so the list
 * name is the board's own label and the platform's published name wins at the check; Workday
 * publishes one only on a posting, so its list name stays empty (verify.ts, workdayName).
 */
export async function importCommonCrawl(args: {
  crawl?: string
  providers?: SourceType[]
  onBlock?: (provider: SourceType, done: number, total: number) => void
}): Promise<DiscoverSummary[]> {
  const crawl = args.crawl ?? CC_LATEST
  const known = await knownBoardKeys()
  const found = await discoverBoards({ crawl, providers: args.providers, onBlock: args.onBlock })
  const summaries: DiscoverSummary[] = []
  for (const result of found) {
    // Workday site paths keep their case in a link ("AccentureCareers", "accenturecareers") but
    // name one site, so a board already in the catalog in any case is not added again.
    const existing = await db.catalogBoard.findMany({
      where: { provider: result.provider },
      select: { providerBoardId: true },
    })
    for (const row of existing) known.add(`${result.provider}:${row.providerBoardId.toLowerCase()}`)
    const seen = new Set<string>()
    const fresh = result.boards.filter((board) => {
      const key = `${result.provider}:${board.toLowerCase()}`
      if (known.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    let added = 0
    for (let start = 0; start < fresh.length; start += 1000) {
      const created = await db.catalogBoard.createMany({
        data: fresh.slice(start, start + 1000).map((board) => ({
          provider: result.provider,
          providerBoardId: board,
          listedName: result.provider === "WORKDAY" ? "" : board.replace(/^eu:/, "").split(".")[0],
          origin: `commoncrawl:${crawl}`,
        })),
        skipDuplicates: true,
      })
      added += created.count
    }
    summaries.push({
      provider: result.provider,
      blocks: result.blocks,
      found: result.boards.length,
      added,
    })
  }
  return summaries
}

/** Takes a verified board's offers out of the index when a later check refuses it. */
async function retire(provider: SourceType, boardId: string, now: Date) {
  const page = await db.careerPage.findUnique({
    where: { provider_providerBoardId: { provider, providerBoardId: boardId } },
    select: { id: true, company: { select: { _count: { select: { watchers: true } } } } },
  })
  if (!page || page.company._count.watchers > 0) return 0
  await db.careerPage.update({ where: { id: page.id }, data: { enabled: false } })
  const closed = await db.job.updateMany({
    where: { careerPageId: page.id, status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
    data: { status: "CLOSED", closedAt: now, lastVerifiedAt: now },
  })
  return closed.count
}

export type CheckResult = { verdict: BoardVerdict; stored: number; closed: number }

/** One check of one catalog board. A pass stores its offers through the same gate as any board. */
export async function checkCatalogBoard(
  row: {
    id: string
    provider: SourceType
    providerBoardId: string
    listedName: string
    status: string
  },
  deps: { http?: HttpClient; robots?: RobotsCache; now?: Date } = {}
): Promise<CheckResult> {
  const http = deps.http ?? createHttpClient()
  const robots = deps.robots ?? createRobotsCache()
  const now = deps.now ?? new Date()
  const verdict = await verifyBoard(row, http, robots)
  let stored = 0
  let closed = 0
  // A read that failed on the network says nothing about a board that passed before.
  const transient = verdict.reason === "error" && row.status === "verified"
  if (verdict.status === "verified" && verdict.listed && verdict.companyName) {
    const listed = settleApiList({ ...verdict.listed, companyName: verdict.companyName })
    const result = await storeBoardInventory({
      board: {
        provider: row.provider,
        boardId: row.providerBoardId,
        companyName: verdict.companyName,
        careersUrl: boardUrl(row.provider, row.providerBoardId),
      },
      listed,
      now,
      nextCheckAt: nextCrawlAt(now, true, false),
    })
    stored = result.stored
    closed = result.closed
    await db.careerPage.updateMany({
      where: { provider: row.provider, providerBoardId: row.providerBoardId },
      data: { enabled: true },
    })
  } else if (!transient && row.status === "verified") {
    closed = await retire(row.provider, row.providerBoardId, now)
  }
  await db.catalogBoard.update({
    where: { id: row.id },
    data: {
      status: transient ? "verified" : verdict.status,
      reason: verdict.reason ?? null,
      note: verdict.note?.slice(0, 500) ?? null,
      companyName: verdict.companyName ?? undefined,
      listedJobs: verdict.listedJobs,
      itJobs: transient ? undefined : verdict.itJobs,
      countries: transient ? undefined : verdict.countries,
      checkedAt: now,
      verifiedAt: verdict.status === "verified" ? now : undefined,
      nextCheckAt: nextCatalogCheck(now, transient ? "rejected" : verdict.status, verdict.reason),
      checks: { increment: 1 },
    },
  })
  return { verdict, stored, closed }
}

const DUE_SELECT = {
  id: true,
  provider: true,
  providerBoardId: true,
  listedName: true,
  status: true,
} as const

/** Boards to check now: verified and rejected ones whose time has come, then never-checked candidates. */
export async function dueCatalogBoards(args: {
  now?: Date
  limit: number
  providers?: SourceType[]
  candidatesOnly?: boolean
}) {
  const now = args.now ?? new Date()
  const provider = args.providers?.length ? { provider: { in: args.providers } } : {}
  const rows = args.candidatesOnly
    ? []
    : await db.catalogBoard.findMany({
        where: { ...provider, nextCheckAt: { lte: now } },
        orderBy: { nextCheckAt: "asc" },
        take: args.limit,
        select: DUE_SELECT,
      })
  if (rows.length >= args.limit) return rows
  const candidates = await db.catalogBoard.findMany({
    where: { ...provider, status: "candidate", nextCheckAt: null },
    orderBy: { createdAt: "asc" },
    take: args.limit - rows.length,
    select: DUE_SELECT,
  })
  return [...rows, ...candidates]
}

/** One due catalog board for the worker loop. False when none is due. */
export async function indexNextCatalog(
  http: HttpClient = createHttpClient(),
  now = new Date()
): Promise<boolean> {
  const [row] = await dueCatalogBoards({ now, limit: 1 })
  if (!row) return false
  try {
    const result = await checkCatalogBoard(row, { http, now })
    console.log(
      `Catalog ${row.provider}/${row.providerBoardId}: ${result.verdict.status}${
        result.verdict.reason ? ` (${result.verdict.reason})` : ""
      }, stored ${result.stored}`
    )
  } catch (error) {
    console.error("Catalog check failed", error instanceof Error ? error.message : error)
    await db.catalogBoard.update({
      where: { id: row.id },
      data: { checkedAt: now, nextCheckAt: new Date(now.getTime() + 6 * 60 * 60 * 1000) },
    })
  }
  return true
}

/**
 * Providers checked in one lane. A shared API host keeps the 1 s pace that way without idle lanes.
 * Recruitee hosts each company on its own subdomain but limits the platform as a whole: six lanes
 * drew HTTP 429 on 240 boards (2026-11-03). Other tenant-hosted platforms run several lanes.
 */
export const SHARED_HOST_PROVIDERS = new Set<SourceType>([
  "GREENHOUSE",
  "ASHBY",
  "LEVER",
  "WORKABLE",
  "RECRUITEE",
])

export type BulkProgress = {
  checked: number
  verified: number
  stored: number
  reasons: Record<string, number>
}

/** Checks every due board of the given providers, in parallel lanes, until none is left or the cap. */
export async function checkCatalogBulk(args: {
  providers: SourceType[]
  max?: number
  tenantLanes?: number
  onProgress?: (progress: BulkProgress) => void
}): Promise<BulkProgress> {
  const progress: BulkProgress = { checked: 0, verified: 0, stored: 0, reasons: {} }
  const robots = createRobotsCache()
  const http = createHttpClient()
  const max = args.max ?? Number.POSITIVE_INFINITY
  const claimed = new Set<string>()
  async function lane(provider: SourceType) {
    while (progress.checked < max) {
      const rows = await dueCatalogBoards({ providers: [provider], limit: 50 })
      const row = rows.find((item) => !claimed.has(item.id))
      if (!row) return
      claimed.add(row.id)
      try {
        const result = await checkCatalogBoard(row, { http, robots })
        progress.checked += 1
        if (result.verdict.status === "verified") progress.verified += 1
        progress.stored += result.stored
        const key = result.verdict.reason ?? "verified"
        progress.reasons[key] = (progress.reasons[key] ?? 0) + 1
      } catch (error) {
        progress.checked += 1
        progress.reasons.crash = (progress.reasons.crash ?? 0) + 1
        console.error(
          `Catalog ${provider}/${row.providerBoardId} crashed`,
          error instanceof Error ? error.message : error
        )
        await db.catalogBoard.update({
          where: { id: row.id },
          data: { checkedAt: new Date(), nextCheckAt: new Date(Date.now() + 6 * 60 * 60 * 1000) },
        })
      }
      if (progress.checked % 50 === 0) args.onProgress?.(progress)
    }
  }
  const lanes: Promise<void>[] = []
  for (const provider of args.providers) {
    const count = SHARED_HOST_PROVIDERS.has(provider) ? 1 : Math.max(1, args.tenantLanes ?? 6)
    for (let index = 0; index < count; index += 1) lanes.push(lane(provider))
  }
  await Promise.all(lanes)
  args.onProgress?.(progress)
  return progress
}

export async function catalogStatus() {
  const byStatus = await db.catalogBoard.groupBy({
    by: ["provider", "status"],
    _count: { _all: true },
    _sum: { itJobs: true },
  })
  const byReason = await db.catalogBoard.groupBy({
    by: ["reason"],
    where: { status: "rejected" },
    _count: { _all: true },
  })
  return { byStatus, byReason }
}
