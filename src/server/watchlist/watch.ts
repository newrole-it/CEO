/**
 * Watched companies: a person names a company (URL or name) and Nowa Rola keeps
 * reading its own careers page or ATS board, even when it never posts on aggregators.
 */
import { Prisma, type SourceType } from "@prisma/client"
import db from "db"
import { canonicalUrl } from "src/server/jobs/dedupe"
import { normalizeCompanyName, normalizeWhitespace } from "src/server/jobs/normalize"
import { saveDiscoveredJob } from "src/server/index/store"
import { enqueueIndexWatched } from "src/server/queue/enqueue"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { companyDomain, hostOf } from "src/server/discovery/careers-detect"
import { detectBoard } from "src/server/discovery/boards"
import { searchProvider, searchWeb, type WebHit } from "src/server/discovery/web-search"
import { resolveName, resolveUrl, type Resolution } from "./resolve"

export type WatchSource = "user" | "similar" | "mcp"

export type WatchInput = {
  userId: number
  url?: string
  name?: string
  source: WatchSource
  reason?: string
}

export type WatchResult = {
  status: "watching" | "resolved-ats" | "career-site" | "link-only" | "not-found"
  companyId?: string
  careerPageUrl?: string
  provider?: string
  message: string
}

export type WatchDeps = {
  http?: HttpClient
  search?: (query: string) => Promise<{ provider: string; hits: WebHit[] }>
  now?: Date
}

export type WatchedRow = {
  companyId: string
  name: string
  domain: string | null
  source: string
  reason: string | null
  openJobs: number
  /** Active offers first seen after `since`. */
  newJobs: number
  /** Career page provider (GREENHOUSE, CAREER_SITE, GENERIC_HTML, ...). */
  provider: string | null
  /** How offers are read: ATS board, the company's own pages, or a link only. */
  readMode: "ats" | "career-site" | "link-only" | null
  careerPageUrl: string | null
  lastFetchedAt: Date | null
}

/** Board ids for pages Nowa Rola reads itself (JSON-LD) or only links to. */
export function siteBoardId(url: string): string {
  return `site:${hostOf(url) ?? url}`.slice(0, 180)
}

export function linkBoardId(url: string): string {
  return `link:${hostOf(url) ?? url}`.slice(0, 180)
}

function safeCanonical(raw: string): string {
  try {
    return canonicalUrl(raw)
  } catch {
    return raw
  }
}

function isUnique(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}

/** Find or create a company by name, then by domain. The domain is set only when free. */
async function upsertCompany(name: string, domain: string | null, byDomainFirst: boolean) {
  const companyName = normalizeWhitespace(name) || domain || "Unknown company"
  const normalizedName = normalizeCompanyName(companyName) || companyName.toLowerCase()
  const byDomain = domain ? await db.company.findUnique({ where: { canonicalDomain: domain } }) : null
  if (byDomain && byDomainFirst) return byDomain
  const byName = await db.company.findUnique({ where: { normalizedName } })
  if (byName) {
    if (domain && !byName.canonicalDomain && !byDomain) {
      return db.company.update({ where: { id: byName.id }, data: { canonicalDomain: domain } })
    }
    return byName
  }
  try {
    return await db.company.create({
      data: { name: companyName, normalizedName, canonicalDomain: byDomain ? null : domain },
    })
  } catch (error) {
    if (!isUnique(error)) throw error
    const again = await db.company.findUnique({ where: { normalizedName } })
    if (!again) throw error
    return again
  }
}

async function upsertPage(args: {
  companyId: string
  url: string
  provider: SourceType
  boardId: string
  status: "RESOLVED_ATS" | "RESOLVED_GENERIC"
  enabled: boolean
  note?: string | null
  now: Date
}) {
  const existing = await db.careerPage.findUnique({
    where: { provider_providerBoardId: { provider: args.provider, providerBoardId: args.boardId } },
  })
  if (existing) {
    if (!existing.enabled && args.enabled) {
      return db.careerPage.update({
        where: { id: existing.id },
        data: { enabled: true, nextCheckAt: null },
      })
    }
    return existing
  }
  try {
    return await db.careerPage.create({
      data: {
        companyId: args.companyId,
        url: args.url,
        normalizedUrl: safeCanonical(args.url),
        provider: args.provider,
        providerBoardId: args.boardId,
        resolutionStatus: args.status,
        confidence: args.status === "RESOLVED_ATS" ? 1 : 0.7,
        enabled: args.enabled,
        fetchNote: args.note?.slice(0, 500) ?? null,
        lastCheckedAt: args.now,
      },
    })
  } catch (error) {
    if (!isUnique(error)) throw error
    const again = await db.careerPage.findUnique({
      where: { provider_providerBoardId: { provider: args.provider, providerBoardId: args.boardId } },
    })
    if (!again) throw error
    return again
  }
}

async function addWatch(userId: number, companyId: string, source: WatchSource, reason?: string) {
  await db.watchedCompany.upsert({
    where: { userId_companyId: { userId, companyId } },
    update: {},
    create: { userId, companyId, source, reason: reason?.slice(0, 300) ?? null },
  })
}

/** A company already read by the index: found by board, domain, or exact name. */
async function alreadyIndexed(input: { url?: string; name?: string }) {
  const board = input.url ? detectBoard(input.url) : null
  if (board) {
    const page = await db.careerPage.findFirst({
      where: {
        provider: board.provider,
        providerBoardId: { equals: board.boardId, mode: "insensitive" },
      },
      include: { company: true },
    })
    if (page) return { company: page.company, page }
  }
  const domain = input.url ? companyDomain(input.url) : null
  const company =
    (domain ? await db.company.findUnique({ where: { canonicalDomain: domain } }) : null) ??
    (input.name
      ? await db.company.findUnique({ where: { normalizedName: normalizeCompanyName(input.name) } })
      : null)
  if (!company && domain) {
    const pages = await db.careerPage.findMany({
      where: { url: { contains: domain, mode: "insensitive" }, enabled: true },
      include: { company: true },
      take: 5,
    })
    const page = pages.find((item) => companyDomain(item.url) === domain)
    if (page) return { company: page.company, page }
  }
  if (!company) return null
  const page = await db.careerPage.findFirst({
    where: { companyId: company.id, enabled: true, lastSuccessfulFetchAt: { not: null } },
    orderBy: { lastSuccessfulFetchAt: "desc" },
  })
  return page ? { company, page } : null
}

function defaultSearch(http: HttpClient) {
  return searchProvider().configured ? (query: string) => searchWeb(query, http) : undefined
}

/**
 * Watch a company by homepage, careers page, ATS board URL, or name.
 * Resolves the source, stores Company + CareerPage, and queues an index run.
 */
export async function watchCompany(input: WatchInput, deps: WatchDeps = {}): Promise<WatchResult> {
  const now = deps.now ?? new Date()
  const http = deps.http ?? createHttpClient()
  const url = input.url?.trim() || undefined
  const name = input.name?.trim() || undefined
  if (!url && !name) return { status: "not-found", message: "Give a company website or name." }

  const known = await alreadyIndexed({ url, name })
  if (known) {
    await addWatch(input.userId, known.company.id, input.source, input.reason)
    if (known.page.enabled) await enqueueIndexWatched(known.page.id)
    return {
      status: "watching",
      companyId: known.company.id,
      careerPageUrl: known.page.url,
      provider: known.page.provider,
      message: `${known.company.name} is already indexed. Watching it now.`,
    }
  }

  const search = deps.search ?? defaultSearch(http)
  const resolution: Resolution = url
    ? await resolveUrl(url, { http, search }, name)
    : await resolveName(name!, { http, search })
  return persistResolution(input, resolution, now)
}

export async function persistResolution(
  input: WatchInput,
  resolution: Resolution,
  now: Date
): Promise<WatchResult> {
  if (resolution.kind === "not-found") return { status: "not-found", message: resolution.message }

  if (resolution.kind === "ats") {
    const existing = await db.careerPage.findUnique({
      where: {
        provider_providerBoardId: {
          provider: resolution.provider,
          providerBoardId: resolution.boardId,
        },
      },
    })
    const company = existing
      ? await db.company.findUniqueOrThrow({ where: { id: existing.companyId } })
      : await upsertCompany(resolution.companyName, resolution.domain, false)
    const page =
      existing ??
      (await upsertPage({
        companyId: company.id,
        url: resolution.careersUrl,
        provider: resolution.provider,
        boardId: resolution.boardId,
        status: "RESOLVED_ATS",
        enabled: true,
        now,
      }))
    await addWatch(input.userId, company.id, input.source, input.reason)
    await enqueueIndexWatched(page.id)
    return {
      status: "resolved-ats",
      companyId: company.id,
      careerPageUrl: page.url,
      provider: resolution.provider,
      message: `${company.name} publishes on ${resolution.provider.toLowerCase()} (${resolution.openJobs} open offers). Indexing now.`,
    }
  }

  if (resolution.kind === "career-site") {
    const company = await upsertCompany(
      resolution.companyName || resolution.domain || "Company",
      resolution.domain,
      true
    )
    const boardId = siteBoardId(resolution.careersUrl)
    const page = await upsertPage({
      companyId: company.id,
      url: resolution.careersUrl,
      provider: "GENERIC_HTML",
      boardId,
      status: "RESOLVED_GENERIC",
      enabled: true,
      note: "Read from schema.org JobPosting data on the company site",
      now,
    })
    let stored = 0
    for (const job of resolution.jobs.slice(0, 20)) {
      try {
        await saveDiscoveredJob(
          { ...job, companyName: company.name, sourceType: "GENERIC_HTML", sourceBoardId: boardId },
          now
        )
        stored += 1
      } catch (error) {
        console.error("Watched offer not stored", error instanceof Error ? error.message : error)
      }
    }
    await addWatch(input.userId, company.id, input.source, input.reason)
    await enqueueIndexWatched(page.id)
    return {
      status: "career-site",
      companyId: company.id,
      careerPageUrl: page.url,
      provider: "career-site",
      message: `${company.name}: read ${stored} offers from its own careers pages. More follow in the background.`,
    }
  }

  const label = resolution.companyName || resolution.domain || hostOf(resolution.careersUrl) || "Company"
  const company = await upsertCompany(label, resolution.domain, true)
  const page = await upsertPage({
    companyId: company.id,
    url: resolution.careersUrl,
    provider: "GENERIC_HTML",
    boardId: linkBoardId(resolution.careersUrl),
    status: "RESOLVED_GENERIC",
    enabled: false,
    note: `Link only: ${resolution.reason}`,
    now,
  })
  await addWatch(input.userId, company.id, input.source, input.reason)
  return {
    status: "link-only",
    companyId: company.id,
    careerPageUrl: page.url,
    provider: "link",
    message: `${company.name}: ${resolution.reason}`,
  }
}

export async function unwatchCompany(userId: number, companyId: string): Promise<void> {
  await db.watchedCompany.deleteMany({ where: { userId, companyId } })
}

/** The page shown for a company: a read source first, then the newest fetch. */
export function primaryPage<
  T extends { enabled: boolean; url: string; lastSuccessfulFetchAt: Date | null },
>(pages: T[]): T | null {
  const sorted = [...pages].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
    return (b.lastSuccessfulFetchAt?.getTime() ?? 0) - (a.lastSuccessfulFetchAt?.getTime() ?? 0)
  })
  return sorted[0] ?? null
}

/** Watched companies with open offers; `newJobs` counts offers first seen after `since` (0 without it). */
export async function listWatched(
  userId: number,
  opts: { since?: Date } = {}
): Promise<WatchedRow[]> {
  const rows = await db.watchedCompany.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: {
      company: {
        include: {
          careerPages: {
            select: { url: true, enabled: true, lastSuccessfulFetchAt: true, provider: true },
          },
        },
      },
    },
  })
  const counts = rows.length
    ? await db.job.groupBy({
        by: ["companyId"],
        where: { companyId: { in: rows.map((row) => row.companyId) }, status: "ACTIVE" },
        _count: { _all: true },
      })
    : []
  const open = new Map(counts.map((row) => [row.companyId, row._count._all]))
  const fresh =
    rows.length && opts.since
      ? await db.job.groupBy({
          by: ["companyId"],
          where: {
            companyId: { in: rows.map((row) => row.companyId) },
            status: "ACTIVE",
            firstSeenAt: { gt: opts.since },
          },
          _count: { _all: true },
        })
      : []
  const newer = new Map(fresh.map((row) => [row.companyId, row._count._all]))
  return rows.map((row) => {
    const page = primaryPage(row.company.careerPages)
    const ownDomain = row.company.careerPages
      .filter((item) => item.provider === "GENERIC_HTML" || item.provider === "CAREER_SITE")
      .map((item) => companyDomain(item.url))
      .find(Boolean)
    return {
      companyId: row.companyId,
      name: row.company.name,
      domain: row.company.canonicalDomain ?? ownDomain ?? null,
      source: row.source,
      reason: row.reason,
      openJobs: open.get(row.companyId) ?? 0,
      newJobs: newer.get(row.companyId) ?? 0,
      provider: page?.provider ?? null,
      readMode: !page ? null : !page.enabled ? "link-only" : page.provider === "GENERIC_HTML" ? "career-site" : "ats",
      careerPageUrl: page?.url ?? null,
      lastFetchedAt: page?.lastSuccessfulFetchAt ?? null,
    }
  })
}
