/**
 * Hidden-offer hunt. For watched and liked companies that have no readable source
 * yet, search career-page-first ("<company> kariera", site:<domain> <role>, ATS
 * hosts) and feed hits to watchCompany / ingestOfferUrl. Bounded and logged.
 */
import { Prisma } from "@prisma/client"
import db from "db"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { watchCompany } from "src/server/watchlist/watch"
import { boardAgrees } from "src/server/watchlist/resolve"
import { classifyHit } from "./boards"
import { companyDomain, hostOf, isAggregatorHost, looksLikeJobPath } from "./careers-detect"
import { ingestOfferUrl } from "./ingest-offer"
import { offerQuery } from "./offer-search"
import { discoveryQueryLimit } from "./queries"
import { searchProvider, searchWeb, type WebHit } from "./web-search"
import { expandSimilarCompanies } from "./similar-companies"

export const HUNT_SOURCE = "hidden_offer_hunt"
export const HUNT_INTERVAL_MS = 12 * 60 * 60 * 1000
const HUNT_QUERY_CAP = 6
const MAX_WATCHES = 3
const MAX_INGESTS = 5

const ATS_SITES =
  "(site:teamtailor.com OR site:recruitee.com OR site:jobs.lever.co OR site:job-boards.greenhouse.io OR site:apply.workable.com OR site:jobs.ashbyhq.com OR site:traffit.com OR site:jobs.personio.de)"

export type HuntTarget = {
  userId: number
  companyId: string
  name: string
  domain: string | null
}

export type HuntQuery = { query: string; target: HuntTarget }

function quote(value: string): string {
  return value.replace(/"/g, "").replace(/\s+/g, " ").trim()
}

/** Queries for one company, career page first. */
export function queriesFor(target: HuntTarget, roles: string[]): string[] {
  const name = quote(target.name)
  const out: string[] = []
  if (target.domain) {
    out.push(`site:${target.domain} kariera OR careers OR jobs`)
  } else {
    out.push(`"${name}" kariera OR careers`)
  }
  out.push(`"${name}" ${ATS_SITES}`)
  for (const role of roles.slice(0, 2)) {
    out.push(target.domain ? `site:${target.domain} ${quote(role)}` : offerQuery(name, quote(role)))
  }
  return out
}

/** Round-robin over companies so a small cap still touches each one. Pure. */
export function buildHuntQueries(targets: HuntTarget[], roles: string[], limit: number): HuntQuery[] {
  const perTarget = targets.map((target) => queriesFor(target, roles))
  const out: HuntQuery[] = []
  const seen = new Set<string>()
  for (let round = 0; out.length < limit; round++) {
    let any = false
    for (let index = 0; index < targets.length && out.length < limit; index++) {
      const query = perTarget[index]![round]
      if (!query) continue
      any = true
      if (seen.has(query)) continue
      seen.add(query)
      out.push({ query, target: targets[index]! })
    }
    if (!any) break
  }
  return out
}

export type HitAction =
  | { kind: "watch"; url: string }
  | { kind: "ingest"; url: string }
  | { kind: "skip" }

/** What to do with one search hit for a target company. Pure. */
export function actionForHit(hit: WebHit, target: HuntTarget): HitAction {
  const host = hostOf(hit.url)
  if (!host || isAggregatorHost(host)) return { kind: "skip" }
  const classified = classifyHit(hit.url)
  if (classified.kind === "ats") {
    return boardAgrees({ boardId: classified.boardId }, { name: target.name, domain: target.domain })
      ? { kind: "watch", url: hit.url }
      : { kind: "skip" }
  }
  if (classified.kind !== "other") return { kind: "skip" }
  const domain = companyDomain(hit.url)
  if (!target.domain || !domain || (domain !== target.domain && !domain.endsWith(`.${target.domain}`))) {
    return { kind: "skip" }
  }
  let path = "/"
  try {
    path = new URL(hit.url).pathname
  } catch {
    return { kind: "skip" }
  }
  if (looksLikeJobPath(path)) return { kind: "ingest", url: hit.url }
  if (/kariera|career|jobs|praca|join|dolacz/i.test(path)) return { kind: "watch", url: hit.url }
  return { kind: "skip" }
}

/** Watched and liked companies without a source we can read. */
async function huntTargets(): Promise<HuntTarget[]> {
  const healthy = { some: { enabled: true, lastSuccessfulFetchAt: { not: null } } }
  const watched = await db.watchedCompany.findMany({
    where: { company: { careerPages: { none: healthy.some } } },
    select: { userId: true, company: { select: { id: true, name: true, canonicalDomain: true } } },
    take: 50,
  })
  const liked = await db.offerFeedback.findMany({
    where: {
      verdict: { in: ["LIKE", "APPLIED"] },
      job: { company: { careerPages: { none: healthy.some } } },
    },
    select: { userId: true, job: { select: { company: { select: { id: true, name: true, canonicalDomain: true } } } } },
    take: 50,
  })
  const out = new Map<string, HuntTarget>()
  for (const row of watched) {
    out.set(row.company.id, {
      userId: row.userId,
      companyId: row.company.id,
      name: row.company.name,
      domain: row.company.canonicalDomain,
    })
  }
  for (const row of liked) {
    const company = row.job.company
    if (out.has(company.id)) continue
    out.set(company.id, { userId: row.userId, companyId: company.id, name: company.name, domain: company.canonicalDomain })
  }
  return [...out.values()]
}

function stringList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : []
}

async function rolesFor(userIds: number[]): Promise<string[]> {
  if (!userIds.length) return []
  const searches = await db.savedSearch.findMany({
    where: { userId: { in: userIds }, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { phrase: true, targetTitles: true },
    take: 5,
  })
  const roles = searches.flatMap((search) => [...stringList(search.targetTitles).slice(0, 1), search.phrase])
  return [...new Set(roles.map((role) => role.trim()).filter((role) => role.length > 2))].slice(0, 2)
}

async function ensureSource(name: string, url: string) {
  return db.discoverySource.upsert({
    where: { sourceName: name },
    update: {},
    create: { sourceName: name, sourceType: "WEB_SEARCH", sourceUrl: url, enabled: true },
  })
}

export async function runHiddenOfferHunt(args?: {
  now?: Date
  http?: HttpClient
  search?: (query: string) => Promise<{ provider: string; hits: WebHit[] }>
}): Promise<{ queries: number; watched: number; ingested: number; status: "succeeded" | "skipped" }> {
  const now = args?.now ?? new Date()
  if (!args?.search && !searchProvider().configured) {
    return { queries: 0, watched: 0, ingested: 0, status: "skipped" }
  }
  const source = await ensureSource(HUNT_SOURCE, "career-page-first search")
  if (!source.enabled) return { queries: 0, watched: 0, ingested: 0, status: "skipped" }
  const http = args?.http ?? createHttpClient()
  const search = args?.search ?? ((query: string) => searchWeb(query, http))
  const targets = await huntTargets()
  const roles = await rolesFor([...new Set(targets.map((target) => target.userId))])
  const limit = Math.min(discoveryQueryLimit(), HUNT_QUERY_CAP)
  const queries = buildHuntQueries(targets, roles, limit)
  let watched = 0
  let ingested = 0
  for (const item of queries) {
    let added = 0
    let pages = 0
    try {
      const result = await search(item.query)
      if (result.provider === "none") break
      for (const hit of result.hits) {
        const action = actionForHit(hit, item.target)
        if (action.kind === "watch" && watched < MAX_WATCHES) {
          const outcome = await watchCompany(
            {
              userId: item.target.userId,
              url: action.url,
              name: item.target.name,
              source: "similar",
              reason: `Careers source found by search for ${item.target.name}`,
            },
            { http, now }
          )
          if (outcome.status === "resolved-ats" || outcome.status === "career-site") {
            watched += 1
            pages += 1
          }
        }
        if (action.kind === "ingest" && ingested < MAX_INGESTS) {
          const outcome = await ingestOfferUrl({ url: action.url, channel: "web" }, { http, now })
          if (outcome.status === "created") {
            ingested += 1
            added += 1
          }
        }
      }
      await db.discoveryRun.create({
        data: {
          sourceId: source.id,
          query: item.query.slice(0, 500),
          status: "SUCCEEDED",
          resultsCount: result.hits.length,
          newCompaniesCount: added,
          newCareerPagesCount: pages,
          finishedAt: new Date(),
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Hunt query failed"
      await db.discoveryRun.create({
        data: {
          sourceId: source.id,
          query: item.query.slice(0, 500),
          status: "FAILED",
          errorSummary: message.slice(0, 240),
          finishedAt: new Date(),
        },
      })
      if (/daily cap/i.test(message)) break
    }
  }
  await db.discoverySource.update({
    where: { id: source.id },
    data: { lastRunAt: now, lastSuccessAt: now },
  })
  return { queries: queries.length, watched, ingested, status: "succeeded" }
}

let nextHuntCheck = 0

/** Worker hook. Runs at most every 12 hours, only with a search provider. */
export async function maybeHuntHiddenOffers(now = new Date()): Promise<void> {
  if (now.getTime() < nextHuntCheck) return
  nextHuntCheck = now.getTime() + 10 * 60_000
  if (!searchProvider().configured) return
  try {
    const source = await db.discoverySource.findUnique({ where: { sourceName: HUNT_SOURCE } })
    if (source && !source.enabled) return
    if (source?.lastRunAt && now.getTime() - source.lastRunAt.getTime() < HUNT_INTERVAL_MS) return
    const result = await runHiddenOfferHunt({ now })
    console.log(
      `Hidden-offer hunt: ${result.queries} queries, ${result.watched} sources, ${result.ingested} offers`
    )
  } catch (error) {
    console.error("Hidden-offer hunt failed", error instanceof Error ? error.message : error)
  }
}

let nextSimilarCheck = 0

/** Worker hook. Once a day per person with likes; Claude provider only; 5 companies max. */
export async function maybeExpandSimilar(now = new Date()): Promise<void> {
  if (now.getTime() < nextSimilarCheck) return
  nextSimilarCheck = now.getTime() + 60 * 60_000
  try {
    const source = await ensureSource("similar_companies", "claude -p similar employers")
    if (!source.enabled) return
    const state = (source.rateLimitConfig ?? {}) as Record<string, unknown>
    const ran = (state.ran && typeof state.ran === "object" ? state.ran : {}) as Record<string, string>
    const day = now.toISOString().slice(0, 10)
    const users = await db.offerFeedback.findMany({
      where: { verdict: { in: ["LIKE", "APPLIED"] } },
      distinct: ["userId"],
      select: { userId: true },
      take: 20,
    })
    const due = users.map((row) => row.userId).filter((id) => ran[String(id)] !== day).slice(0, 2)
    for (const userId of due) {
      const result = await expandSimilarCompanies(userId, { now })
      if (result.skipped === "Claude provider is not configured") return
      ran[String(userId)] = day
      await db.discoveryRun.create({
        data: {
          sourceId: source.id,
          query: `similar companies for user ${userId}`,
          status: "SUCCEEDED",
          resultsCount: result.proposed,
          newCompaniesCount: result.added,
          errorSummary: result.skipped ?? null,
          finishedAt: new Date(),
        },
      })
    }
    if (due.length) {
      await db.discoverySource.update({
        where: { id: source.id },
        data: { rateLimitConfig: { ran }, lastRunAt: now, lastSuccessAt: now },
      })
    }
  } catch (error) {
    console.error("Similar-company expansion failed", error instanceof Error ? error.message : error)
  }
}
