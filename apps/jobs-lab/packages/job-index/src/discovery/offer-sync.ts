/**
 * Bounded offer search. The worker calls this on a timer. Page views do not.
 * Polish boards are never fetched: a card comes from the search hit. A career
 * page or ATS URL is stored only after a successful fetch that yields a job.
 */
import { Prisma } from "@newrole/jobs-lab-db"
import db from "../db"
import { parseJsonLdJobs } from "@newrole/ats/adapters/jsonld"
import { saveDiscoveredJob } from "../index/store"
import { canonicalUrl } from "@newrole/ats/dedupe"
import { normalizeCompanyName } from "@newrole/ats/normalize"
import { isUniqueViolation } from "../jobs/prisma-errors"
import { createHttpClient, type HttpClient } from "@newrole/ats/host"
import type { ListedJob } from "@newrole/ats/schemas"
import {
  BOARD_DISCOVERY_QUERY,
  fetchedOfferAccepted,
  hasPay,
  offerQuery,
  pickFocus,
  planOfferHits,
  salaryTag,
  titlesEquivalent,
  type KnownOffer,
  type PlannedCreate,
} from "./offer-search"
import { searchProvider, searchWeb, type SearchProviderName, type WebHit } from "./web-search"

export const OFFER_SEARCH_SOURCE = "offer_search"
export const OFFER_SEARCH_INTERVAL_MS = 6 * 60 * 60 * 1000
const MAX_CREATES = 8
const MAX_FETCHES = 3

export type OfferSearchStats = {
  configured: boolean
  provider: SearchProviderName
  added: number
  enriched: number
  lastRunAt: Date | null
  lastStatus: "succeeded" | "failed" | "skipped" | null
  lastError: string | null
}

type SearchState = {
  added: number
  enriched: number
  lastStatus: OfferSearchStats["lastStatus"]
  lastError: string | null
  lastFocus: string | null
}

let nextCheckAt = 0

export async function readOfferSearchStats(): Promise<OfferSearchStats> {
  const provider = searchProvider()
  const source = await db.discoverySource.findUnique({ where: { sourceName: OFFER_SEARCH_SOURCE } })
  const state = readState(source?.rateLimitConfig ?? null)
  return {
    configured: provider.configured,
    provider: provider.provider,
    added: state.added,
    enriched: state.enriched,
    lastRunAt: source?.lastRunAt ?? null,
    lastStatus: state.lastStatus,
    lastError: state.lastError,
  }
}

/** No-ops when no key is set, the source is disabled, or the last run is still fresh. */
export async function maybeSyncOfferSearch(now = new Date()): Promise<void> {
  if (!searchProvider().configured) return
  if (now.getTime() < nextCheckAt) return
  nextCheckAt = now.getTime() + 60_000
  try {
    const source = await db.discoverySource.findUnique({
      where: { sourceName: OFFER_SEARCH_SOURCE },
    })
    if (source && !source.enabled) return
    if (source?.lastRunAt && now.getTime() - source.lastRunAt.getTime() < OFFER_SEARCH_INTERVAL_MS)
      return
    await runBoundedOfferSearch({ now })
  } catch (error) {
    console.error(
      "Offer search failed",
      error instanceof Error ? error.message : "Offer search failed"
    )
  }
}

export async function runBoundedOfferSearch(args?: {
  now?: Date
  http?: HttpClient
  search?: (query: string) => Promise<{ provider: string; hits: WebHit[] }>
}): Promise<{ added: number; enriched: number; status: "succeeded" | "failed" | "skipped" }> {
  const provider = searchProvider()
  if (!provider.configured && !args?.search) return { added: 0, enriched: 0, status: "skipped" }
  const now = args?.now ?? new Date()
  const source = await ensureSource()
  const state = readState(source.rateLimitConfig)
  const focus = pickFocus(await unpaidLeadership(), state.lastFocus)
  const queries = [
    focus ? offerQuery(focus.company, focus.title) : null,
    BOARD_DISCOVERY_QUERY,
  ].filter((query): query is string => Boolean(query))
  const http = args?.http ?? createHttpClient()
  const search = args?.search ?? ((query: string) => searchWeb(query, http))
  let added = 0
  let enriched = 0
  const errors: string[] = []
  let searches = 0
  for (const query of queries) {
    try {
      const result = await search(query)
      searches += 1
      if (result.provider === "none") {
        errors.push("No search key is configured")
        await recordRun(source.id, query, "FAILED", 0, 0, 0, "No search key is configured", now)
        break
      }
      const known = await loadKnown(result.hits, focus)
      const applied = await acceptOfferSearchHits(result.hits, {
        now,
        http,
        focus: query === queries[0] ? focus : null,
        known,
      })
      added += applied.added
      enriched += applied.enriched
      errors.push(...applied.failures)
      await recordRun(
        source.id,
        query,
        "SUCCEEDED",
        result.hits.length,
        applied.added,
        applied.enriched,
        applied.failures[0] ?? null,
        now
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search failed"
      errors.push(message)
      await recordRun(source.id, query, "FAILED", 0, 0, 0, message, now)
    }
  }
  const searchFailed = errors.some(
    (error) => !error.startsWith("Fetch failed") && !error.startsWith("Not stored")
  )
  const status = searches > 0 && !searchFailed ? "succeeded" : "failed"
  const lastError = errors.length ? errors.slice(0, 3).join("; ").slice(0, 240) : null
  await db.discoverySource.update({
    where: { id: source.id },
    data: {
      lastRunAt: now,
      lastSuccessAt: status === "succeeded" ? now : source.lastSuccessAt,
      lastErrorAt: status === "failed" ? now : null,
      rateLimitConfig: {
        added: state.added + added,
        enriched: state.enriched + enriched,
        lastStatus: status,
        lastError,
        lastFocus: focus?.key ?? state.lastFocus,
      },
    },
  })
  return { added, enriched, status }
}

async function unpaidLeadership(): Promise<Array<{ company: string; title: string }>> {
  const rows = await db.job.findMany({
    where: {
      status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] },
      salaryMin: null,
      salaryMax: null,
      salarySourceUrl: null,
      OR: [
        { title: { contains: "Director", mode: "insensitive" } },
        { title: { contains: "Head of", mode: "insensitive" } },
        { title: { contains: "Engineering Manager", mode: "insensitive" } },
        { title: { contains: "VP", mode: "insensitive" } },
      ],
    },
    orderBy: { lastSeenAt: "desc" },
    take: 25,
    select: { title: true, company: { select: { name: true } } },
  })
  return rows.map((row) => ({ company: row.company.name, title: row.title }))
}

async function loadKnown(
  hits: WebHit[],
  focus?: { company: string; title: string; key: string } | null
): Promise<KnownOffer[]> {
  const companies = new Set<string>()
  const urls = new Set<string>()
  if (focus?.company) {
    const name = normalizeCompanyName(focus.company)
    if (name) companies.add(name)
  }
  for (const hit of hits) {
    try {
      urls.add(canonicalUrl(hit.url))
    } catch {
      /* skip */
    }
    const name = companyFromTitle(hit.title || "")
    const normalized = name ? normalizeCompanyName(name) : ""
    if (normalized) companies.add(normalized)
  }
  const or: Prisma.JobWhereInput[] = []
  if (companies.size) {
    const found = await db.company.findMany({
      where: { normalizedName: { in: [...companies] } },
      select: { id: true },
    })
    if (found.length) or.push({ companyId: { in: found.map((company) => company.id) } })
  }
  if (urls.size) or.push({ canonicalUrl: { in: [...urls] } })
  if (!or.length) return []
  const jobs = await db.job.findMany({
    where: { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] }, OR: or },
    select: {
      id: true,
      title: true,
      canonicalUrl: true,
      salaryMin: true,
      salaryMax: true,
      company: { select: { name: true } },
    },
  })
  return jobs.map((job) => ({
    id: job.id,
    company: job.company.name,
    title: job.title,
    canonicalUrl: job.canonicalUrl,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
  }))
}

/**
 * Store offers from search hits the caller already has. Does not call Brave or Serper.
 * At most 8 new offers are written, and at most 3 of those may fetch a career page.
 * Salary copies update an existing offer and do not fetch anything.
 */
export async function acceptOfferSearchHits(
  hits: WebHit[],
  args?: {
    now?: Date
    http?: HttpClient
    focus?: { company: string; title: string } | null
    known?: KnownOffer[]
  }
): Promise<{ added: number; enriched: number; failures: string[] }> {
  const now = args?.now ?? new Date()
  const http = args?.http ?? createHttpClient()
  const focus = args?.focus ?? null
  const known =
    args?.known ??
    (await loadKnown(hits, focus ? { company: focus.company, title: focus.title, key: "" } : null))
  return applyPlan(planOfferHits(hits, known, focus), http, now)
}

async function applyPlan(
  plan: ReturnType<typeof planOfferHits>,
  http: HttpClient,
  now: Date
): Promise<{ added: number; enriched: number; failures: string[] }> {
  let enriched = 0
  for (const item of plan.enrich) {
    const updated = await db.job.updateMany({
      where: { id: item.id, salaryMin: null, salaryMax: null, salarySourceUrl: null },
      data: {
        salaryMin: item.pay.min,
        salaryMax: item.pay.max,
        salaryCurrency: salaryTag(item.pay.currency, item.pay.period),
        salarySourceUrl: item.pay.sourceUrl,
        salarySourceRaw: item.pay.raw.slice(0, 240),
      },
    })
    enriched += updated.count
  }
  let added = 0
  let fetches = 0
  const failures: string[] = []
  for (const item of plan.create) {
    if (added >= MAX_CREATES) break
    if (item.mode === "snippet") {
      try {
        await saveDiscoveredJob(snippetJob(item), now)
        added += 1
      } catch (error) {
        failures.push(`Not stored: ${item.host}`)
        console.error(
          "Could not store search offer",
          error instanceof Error ? error.message : "store failed"
        )
      }
      continue
    }
    if (fetches >= MAX_FETCHES) continue
    fetches += 1
    const stored = await storeFetched(item, http, now)
    if (stored === "stored") added += 1
    else failures.push(`Fetch failed: ${item.host}`)
  }
  return { added, enriched, failures }
}

async function storeFetched(
  item: PlannedCreate,
  http: HttpClient,
  now: Date
): Promise<"stored" | "failed"> {
  try {
    const response = await http.get(item.url, {
      maxBytes: 1_500_000,
      accept: "text/html",
      timeoutMs: 15_000,
    })
    const jobs =
      response.status >= 400 ? [] : parseJsonLdJobs(response.body, response.url, item.company)
    const matched = jobs.filter((job) => titlesEquivalent(job.title, item.title, item.company))
    const chosen = matched[0] ?? (jobs.length === 1 ? jobs[0] : undefined)
    if (!chosen || !fetchedOfferAccepted(response.status, jobs.length)) return "failed"
    const saved = await saveDiscoveredJob(
      {
        ...chosen,
        companyName: chosen.companyName || item.company,
        sourceBoardId:
          chosen.sourceBoardId || `page:${item.host}:${normalizeCompanyName(item.company)}`,
      },
      now
    )
    if (!hasPay(chosen.salaryMin, chosen.salaryMax) && item.pay) {
      let same = false
      try {
        same = canonicalUrl(item.pay.sourceUrl) === saved.canonicalUrl
      } catch {
        same = false
      }
      await db.job.updateMany({
        where: { id: saved.id, salaryMin: null, salaryMax: null },
        data: {
          salaryMin: item.pay.min,
          salaryMax: item.pay.max,
          salaryCurrency: salaryTag(item.pay.currency, item.pay.period),
          salarySourceUrl: same ? null : item.pay.sourceUrl,
          salarySourceRaw: item.pay.raw.slice(0, 240),
        },
      })
    }
    return "stored"
  } catch (error) {
    console.error(
      "Job page was not stored",
      error instanceof Error ? error.message : "fetch failed"
    )
    return "failed"
  }
}

function snippetJob(item: PlannedCreate): ListedJob {
  const boardId = `snippet:${item.host}:${normalizeCompanyName(item.company) || "company"}`.slice(
    0,
    180
  )
  return {
    title: item.title,
    companyName: item.company,
    locationText: item.locationText ?? undefined,
    workplaceType: item.workplaceType,
    descriptionText: item.snippet,
    salaryMin: item.pay?.min,
    salaryMax: item.pay?.max,
    salaryCurrency: item.pay ? salaryTag(item.pay.currency, item.pay.period) : undefined,
    originalUrl: item.url,
    sourceType: "WEB_SEARCH",
    sourceBoardId: boardId,
    needsHydration: false,
  }
}

function companyFromTitle(title: string): string | null {
  const parts = title
    .split(/\s+[-|–—]\s+|\s+@\s+|\s+\bat\b\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length < 2) return null
  const role =
    /\b(director|manager|engineer|engineering|head|lead|developer|designer|dyrektor|kierownik)\b/i
  if (role.test(parts[0]!) && !role.test(parts[parts.length - 1]!)) return parts[parts.length - 1]!
  if (role.test(parts[parts.length - 1]!) && !role.test(parts[0]!)) return parts[0]!
  return null
}

async function ensureSource() {
  const existing = await db.discoverySource.findUnique({
    where: { sourceName: OFFER_SEARCH_SOURCE },
  })
  if (existing) return existing
  try {
    return await db.discoverySource.create({
      data: {
        sourceName: OFFER_SEARCH_SOURCE,
        sourceType: "WEB_SEARCH",
        sourceUrl: "https://api.search.brave.com/res/v1/web/search",
        termsUrl: "https://brave.com/terms-of-use/",
        enabled: true,
        rateLimitConfig: emptyState(),
      },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    const again = await db.discoverySource.findUnique({
      where: { sourceName: OFFER_SEARCH_SOURCE },
    })
    if (!again) throw error
    return again
  }
}

async function recordRun(
  sourceId: string,
  query: string,
  status: "SUCCEEDED" | "FAILED",
  results: number,
  added: number,
  enriched: number,
  error: string | null,
  now: Date
) {
  await db.discoveryRun.create({
    data: {
      sourceId,
      query: query.slice(0, 500),
      status,
      resultsCount: results,
      newCompaniesCount: added,
      newCareerPagesCount: enriched,
      errorSummary: error?.slice(0, 240) ?? null,
      finishedAt: now,
    },
  })
}

function emptyState(): SearchState {
  return { added: 0, enriched: 0, lastStatus: null, lastError: null, lastFocus: null }
}

function readState(value: Prisma.JsonValue | null): SearchState {
  const empty = emptyState()
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty
  const record = value as Record<string, unknown>
  const status = record.lastStatus
  return {
    added: typeof record.added === "number" && record.added >= 0 ? record.added : 0,
    enriched: typeof record.enriched === "number" && record.enriched >= 0 ? record.enriched : 0,
    lastStatus:
      status === "succeeded" || status === "failed" || status === "skipped" ? status : null,
    lastError: typeof record.lastError === "string" ? record.lastError : null,
    lastFocus: typeof record.lastFocus === "string" ? record.lastFocus : null,
  }
}
