import { Prisma } from "@prisma/client"
import db from "db"
import { selectSeedBoards, type SeedBoard } from "config/seed-boards"
import { tenantHost } from "src/server/adapters/hosts"
import { adapterFor, type BoardList, type LiveAts } from "src/server/adapters/registry"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { boardKey, classifyHit, workableSlugFromHtml } from "src/server/discovery/boards"
import { rememberCompanyPage } from "src/server/discovery/company-pages"
import { pickDiscoveryQueries } from "src/server/discovery/queries"
import { searchWeb, type WebHit } from "src/server/discovery/web-search"
import { canonicalUrl as appCanonicalUrl, sha256 } from "src/server/jobs/dedupe"
import {
  cleanDescription,
  normalizeCompanyName,
  normalizeWhitespace,
} from "src/server/jobs/normalize"
import { isUniqueViolation } from "src/server/jobs/prisma-errors"
import { summarize } from "src/server/jobs/text"
import { classificationFields, rememberCompanyTech } from "src/server/classify/persist"
import { keepExternalPay } from "src/server/discovery/offer-search"
import { excerpt } from "src/server/crawler/hygiene"
import { createLlmClient, estimateCost, type LlmClient } from "src/server/llm/client"
import { explainMatch } from "src/server/matching/explain"
import {
  expansionView,
  liveMatchingConfig,
  liveProfile,
  resolveExpansion,
  titleIsRelevant,
} from "src/server/matching/live"
import { APP_TO_SOURCE, SOURCE_TO_APP } from "src/server/matching/sources"
import { publishIndexedMatches, RELEVANCE_FLOOR } from "src/server/index/query"
import { boardsAwaitingIndex } from "src/server/index/run"
import { resolveJobCountries } from "src/server/geo/countries"
import { countryFromQuery } from "src/server/jobs/offer-facts"
import { ensureFxRates } from "src/server/fx/nbp"
import { nextCrawlAt } from "src/server/index/schedule"
import { noteIndexStart, storeBoardInventory } from "src/server/index/store"
import { mapPool } from "src/server/queue/pool"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob, SourceType, WorkplaceType } from "src/shared/schemas"
import { runMatching } from "../../../matching/pipeline"
import type { QueryExpansion } from "../../../matching/query-expansion.schema"
import type { NormalizedPosting, RawPosting } from "../../../matching/types"
import type { ScoreResult } from "../../../matching/scoring"

type BoardTarget = SeedBoard & { origin: "seed" | "search" }

export type SearchDeps = {
  http?: HttpClient
  llm?: LlmClient | null
  boards?: SeedBoard[]
  includeSeedBoards?: boolean
  search?: (query: string) => Promise<{ provider: string; hits: WebHit[] }>
  now?: Date
  /** Production searches score the local index. Tests that pass `boards` skip it. */
  useIndex?: boolean
}

const MAX_HYDRATIONS = 18
const MAX_DISCOVERED = 12

const SCOPED_ATS = new Set<SourceType>([
  "TRAFFIT",
  "RECRUITEE",
  "PERSONIO",
  "PINPOINT",
  "BREEZY",
  "BAMBOOHR",
  "SUCCESSFACTORS",
  "WORKDAY",
  "CAREER_SITE",
  "AVATURE",
  // Ids in these vendors are per tenant, or come from a link pattern.
  "EIGHTFOLD",
  "SOFTGARDEN",
  "BULLHORN",
  "DVINCI",
  "HOMERUN",
  "ONLYFY",
  "REXX",
  "JAZZHR",
  "CATSONE",
  "LOXO",
  "TALENTLYFT",
  "FACTORIAL",
])

async function log(searchRunId: string, message: string, level = "info") {
  await db.searchLog.create({ data: { searchRunId, message: message.slice(0, 400), level } })
}

async function touch(searchRunId: string, data: Prisma.SearchRunUpdateInput) {
  await db.searchRun.update({ where: { id: searchRunId }, data })
}

function providerName(provider: SourceType): string {
  return provider.toLowerCase()
}

export async function executeSearch(searchRunId: string, deps: SearchDeps = {}): Promise<void> {
  if (!deps.http) await ensureFxRates()
  const http = deps.http ?? createHttpClient()
  const llm = deps.llm === undefined ? createLlmClient() : deps.llm
  const now = deps.now ?? new Date()
  const run = await db.searchRun.findUnique({
    where: { id: searchRunId },
    include: { savedSearch: true },
  })
  if (!run) throw new Error(`Search run ${searchRunId} was not found`)
  if (run.status === "SUCCEEDED") return

  await db.jobMatch.deleteMany({ where: { searchRunId } })
  await db.jobObservation.deleteMany({ where: { searchRunId } })
  await db.searchLog.deleteMany({ where: { searchRunId } })
  await db.discoveryRun.deleteMany({ where: { searchRunId } })
  await touch(searchRunId, {
    status: "RUNNING",
    phase: "expanding",
    progress: 8,
    message: "Expanding the phrase",
    startedAt: run.startedAt,
  })

  let tokenInput = 0
  let tokenOutput = 0

  try {
    const phrase = run.savedSearch.phrase
    const locationHint = run.savedSearch.locationHint ?? undefined
    const resolved = await resolveExpansion({ phrase, locationHint }, llm, run.savedSearch.userId)
    tokenInput += resolved.tokenInput
    tokenOutput += resolved.tokenOutput
    const expansion = resolved.expansion
    const view = expansionView(expansion, resolved.source)
    await db.savedSearch.update({
      where: { id: run.savedSearchId },
      data: {
        targetTitles: view.titles,
        includedKeywords: expansion.signalKeywords,
        excludedKeywords: view.exclusions,
        seniority: [view.seniority],
      },
    })
    await touch(searchRunId, {
      expansion: view as unknown as Prisma.InputJsonValue,
      phase: "discovering",
      progress: 22,
      message: `Using ${view.titles.length} related titles`,
      tokenInput,
      tokenOutput,
      estimatedCost: estimateCost(tokenInput, tokenOutput),
    })
    await log(
      searchRunId,
      `Expanded “${phrase}” with ${
        resolved.source === "llm"
          ? "the model"
          : resolved.source === "example"
          ? "a checked example"
          : "a minimal fallback"
      }.`
    )

    if (!deps.boards && deps.useIndex !== false) {
      const indexed = await publishIndexedMatches({
        searchRunId,
        savedSearchId: run.savedSearchId,
        expansion,
        now,
        llm,
      })
      await touch(searchRunId, {
        phase: "topup",
        progress: 48,
        matchedJobs: indexed,
        message: indexed
          ? `${indexed} matching offers from the index. Checking boards that are not indexed yet.`
          : "No index matches yet. Checking boards that are not indexed yet.",
      })
      await log(
        searchRunId,
        indexed
          ? `Index has ${indexed} offers at ${RELEVANCE_FLOOR} or above.`
          : "Index has no offers at the relevance floor yet."
      )
    }

    const disabled = await disabledProviders()
    const boards = new Map<string, BoardTarget>()
    if (deps.includeSeedBoards !== false) {
      const seed = deps.boards ? selectSeedBoards(deps.boards) : await boardsAwaitingIndex(8)
      for (const board of seed) {
        if (disabled.has(providerName(board.provider))) continue
        boards.set(boardKey(board.provider, board.boardId), { ...board, origin: "seed" })
      }
    }

    const queries = pickDiscoveryQueries(expansion.searchQueries.sites)
    const discovery = await discoverBoards({
      searchRunId,
      queries,
      http,
      search: deps.search,
      disabled,
      boards,
    })

    const targets = Array.from(boards.values())
    await touch(searchRunId, {
      phase: "fetching",
      progress: 38,
      discoveredBoards: targets.length,
      message: `Checking ${targets.length} boards`,
    })
    await log(
      searchRunId,
      `Checking ${targets.length} public boards${
        discovery.provider !== "none" ? ` after ${discovery.provider} discovery` : ""
      }. Search hits are not stored.`
    )

    const collected: ListedJob[] = []
    const boardStats: Array<Record<string, unknown>> = []
    let scanned = 0
    let hardFailures = 0
    let finishedBoards = 0
    await mapPool(targets, 3, async (board) => {
      try {
        await noteIndexStart(board, now)
        const listed = await adapterFor(board.provider as LiveAts).list(
          board.boardId,
          http,
          board.companyName
        )
        const jobs = stampCompany(listed, board.companyName)
        scanned += jobs.length
        collected.push(...jobs)
        if (listed.proven || listed.jobs.length > 0) {
          try {
            const complete = listed.complete ?? listed.proven
            await storeBoardInventory({
              board,
              listed: { ...listed, jobs, complete, listedCount: listed.listedCount ?? jobs.length },
              now,
              nextCheckAt: nextCrawlAt(
                now,
                complete,
                listed.budgetExhausted === true,
                listed.jobs.length > 0
              ),
            })
          } catch (error) {
            const message = error instanceof Error ? error.message : "Could not store listings"
            await log(searchRunId, message, "warn")
          }
        }
        boardStats.push({
          provider: board.provider,
          boardId: board.boardId,
          status: listed.proven ? "ok" : "unproven",
          scanned: jobs.length,
          origin: board.origin,
        })
        await log(
          searchRunId,
          listed.proven
            ? `${board.companyName}: ${jobs.length} listings${
                listed.note ? ` (${listed.note})` : ""
              }`
            : `${board.companyName}: ${listed.note || "board not proven"}`
        )
        await db.careerPage.updateMany({
          where: { provider: board.provider, providerBoardId: board.boardId },
          data: {
            lastCheckedAt: now,
            fetchNote: listed.note?.slice(0, 500) ?? null,
            ...(listed.proven
              ? { lastSuccessfulFetchAt: now, lastErrorCode: null }
              : { lastErrorCode: "NOT_PERMITTED" }),
          },
        })
      } catch (error) {
        hardFailures += 1
        const message = error instanceof Error ? error.message : "Board fetch failed"
        boardStats.push({ provider: board.provider, boardId: board.boardId, status: "error" })
        await log(searchRunId, `${board.companyName}: ${message}`, "warn")
      } finally {
        finishedBoards += 1
        const progress = 38 + Math.round((finishedBoards / Math.max(targets.length, 1)) * 28)
        await touch(searchRunId, {
          progress,
          fetchedJobs: scanned,
          message: `Read ${finishedBoards} of ${targets.length} boards`,
        })
      }
    })

    if (discovery.pages.length) {
      const extra = await readJsonLdPages(discovery.pages, http, searchRunId, discovery.provider)
      scanned += extra.length
      collected.push(...extra)
    }

    if (targets.length > 0 && hardFailures === targets.length && collected.length === 0) {
      throw new Error("Every source failed. Nothing was ranked.")
    }

    const relevant = collected.filter((job) => titleIsRelevant(job.title, expansion))
    relevant.sort((a, b) => overlap(b.title, expansion) - overlap(a.title, expansion))
    let hydrations = 0
    for (const job of relevant) {
      if (hydrations >= MAX_HYDRATIONS) break
      if (!job.needsHydration || !isLiveAts(job.sourceType)) continue
      const adapter = adapterFor(job.sourceType)
      if (!adapter.hydrate) continue
      hydrations += 1
      try {
        const hydrated = await adapter.hydrate(job, http)
        Object.assign(job, hydrated, { needsHydration: false })
      } catch (error) {
        const message = error instanceof Error ? error.message : "Description fetch failed"
        await log(searchRunId, message, "warn")
      }
    }

    await touch(searchRunId, {
      phase: "scoring",
      progress: 78,
      message: `Scoring ${relevant.length} title matches`,
    })
    const raws = relevant.flatMap((job) => {
      const raw = toRaw(job, now)
      return raw ? [raw] : []
    })
    const profile = liveProfile(expansion, {
      country: countryFromQuery(run.savedSearch.locationHint ?? ""),
    })
    const matched = runMatching(raws, profile, now, liveMatchingConfig())
    const byId = new Map(matched.postings.map((posting) => [posting.id, posting]))
    const ranked = matched.ranked.filter((score) => score.score >= RELEVANCE_FLOOR)

    const prior = await db.jobMatch.findMany({
      where: {
        savedSearchId: run.savedSearchId,
        searchRun: { status: "SUCCEEDED", id: { not: searchRunId } },
      },
      select: { jobId: true },
    })
    const seen = new Set(prior.map((match) => match.jobId))
    const hadPrior =
      prior.length > 0 ||
      (await db.searchRun.count({
        where: { savedSearchId: run.savedSearchId, status: "SUCCEEDED" },
      })) > 0
    let newJobs = 0
    const listedByKey = new Map(relevant.map((job) => [rawId(job), job]))

    for (const [index, score] of ranked.entries()) {
      const posting = byId.get(score.postingId)
      if (!posting) continue
      const listed = listedByKey.get(posting.id)
      const explained = await explainMatch({
        llm,
        posting,
        score,
        profile,
        index,
        llmOptOut: listed?.llmOptOut,
        userId: run.savedSearch.userId,
      })
      tokenInput += explained.tokenInput
      tokenOutput += explained.tokenOutput
      const reason = explained.reason
      const stored = await upsertJob({ posting, listed, score, searchRunId, now })
      const isNew = hadPrior && !seen.has(stored.id)
      if (isNew) newJobs += 1
      await db.jobMatch.upsert({
        where: { jobId_searchRunId: { jobId: stored.id, searchRunId } },
        update: {
          score: score.score,
          scoreBreakdown: breakdown(score, posting) as unknown as Prisma.InputJsonValue,
          reason: reason.slice(0, 500),
          isNew,
        },
        create: {
          jobId: stored.id,
          savedSearchId: run.savedSearchId,
          searchRunId,
          score: score.score,
          scoreBreakdown: breakdown(score, posting) as unknown as Prisma.InputJsonValue,
          reason: reason.slice(0, 500),
          isNew,
        },
      })
    }

    const matchedJobs = await db.jobMatch.count({ where: { searchRunId } })
    await touch(searchRunId, {
      status: "SUCCEEDED",
      phase: "done",
      progress: 100,
      message: matchedJobs
        ? `${matchedJobs} matching offers`
        : "No matching offers in the index or the boards checked",
      finishedAt: new Date(),
      fetchedJobs: scanned,
      matchedJobs,
      newJobs,
      tokenInput,
      tokenOutput,
      estimatedCost: estimateCost(tokenInput, tokenOutput),
      stats: {
        queries,
        searchProvider: discovery.provider,
        discoveredSlugs: discovery.added,
        skippedPolishHits: discovery.skippedPolish,
        skippedWorkdayHits: discovery.skippedWorkday,
        skippedUnverifiedAts: discovery.skippedPlanned,
        boards: boardStats,
      } as Prisma.InputJsonValue,
    })
    await log(
      searchRunId,
      matchedJobs
        ? `${matchedJobs} matching offers. This pass read ${scanned} listings.${
            hadPrior ? ` ${newJobs} are new since the last run.` : ""
          }`
        : `Finished with no offers at ${RELEVANCE_FLOOR} or above.`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed"
    await touch(searchRunId, {
      status: "FAILED",
      phase: "failed",
      progress: 100,
      message,
      errorSummary: message.slice(0, 400),
      finishedAt: new Date(),
      tokenInput,
      tokenOutput,
      estimatedCost: estimateCost(tokenInput, tokenOutput),
    })
    await log(searchRunId, message, "error")
    throw error
  }
}

function stampCompany(listed: BoardList, fallback: string): ListedJob[] {
  if (!listed.proven) return []
  return listed.jobs.map((job) => ({
    ...job,
    companyName: job.companyName || listed.companyName || fallback,
  }))
}

async function disabledProviders(): Promise<Set<string>> {
  const sources = await db.discoverySource.findMany()
  return new Set(sources.filter((source) => !source.enabled).map((source) => source.sourceName))
}

async function discoverBoards(args: {
  searchRunId: string
  queries: string[]
  http: HttpClient
  search?: SearchDeps["search"]
  disabled: Set<string>
  boards: Map<string, BoardTarget>
}): Promise<{
  provider: string
  added: number
  skippedPolish: number
  skippedWorkday: number
  skippedPlanned: number
  pages: string[]
}> {
  const searchOff =
    args.disabled.has("web_search") || args.disabled.has("brave") || args.disabled.has("serper")
  if (searchOff || args.queries.length === 0) {
    await log(args.searchRunId, "Web search is off. Using the seed boards only.")
    return {
      provider: "none",
      added: 0,
      skippedPolish: 0,
      skippedWorkday: 0,
      skippedPlanned: 0,
      pages: [],
    }
  }
  const search = args.search ?? ((query: string) => searchWeb(query, args.http))
  let provider = "none"
  let added = 0
  let skippedPolish = 0
  let skippedWorkday = 0
  let skippedPlanned = 0
  const pages: string[] = []
  for (const query of args.queries) {
    try {
      const result = await search(query)
      provider = result.provider
      if (result.provider === "none") {
        await log(args.searchRunId, "No Brave or Serper key is set. Seed boards only.")
        break
      }
      let newSlugs = 0
      for (const hit of result.hits) {
        const classified = classifyHit(hit.url)
        if (classified.kind === "polish") {
          skippedPolish += 1
          continue
        }
        if (classified.kind === "workday") {
          skippedWorkday += 1
          continue
        }
        if (classified.kind === "unverified-ats") {
          skippedPlanned += 1
          continue
        }
        if (classified.kind === "workable-shortcode") {
          const slug = await resolveWorkableSlug(hit.url, args.http)
          if (slug) {
            newSlugs += addBoard(args.boards, "WORKABLE", slug, args.disabled)
          }
          continue
        }
        if (classified.kind === "ats") {
          newSlugs += addBoard(args.boards, classified.provider, classified.boardId, args.disabled)
          continue
        }
        rememberCompanyPage(pages, hit.url)
      }
      added += newSlugs
      await db.discoveryRun.create({
        data: {
          searchRunId: args.searchRunId,
          query,
          status: "SUCCEEDED",
          resultsCount: result.hits.length,
          newCompaniesCount: newSlugs,
          finishedAt: new Date(),
        },
      })
      await log(
        args.searchRunId,
        `${result.provider}: ${result.hits.length} hits, ${newSlugs} new slugs. Result URLs were not stored.`
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : "Search query failed"
      await log(args.searchRunId, message, "warn")
      await db.discoveryRun.create({
        data: {
          searchRunId: args.searchRunId,
          query,
          status: "FAILED",
          errorSummary: message.slice(0, 240),
          finishedAt: new Date(),
        },
      })
    }
  }
  if (skippedPolish)
    await log(args.searchRunId, `Left ${skippedPolish} Polish-board hits as links only.`)
  if (skippedWorkday)
    await log(
      args.searchRunId,
      `Left ${skippedWorkday} Workday search hits unstored. Seeded Workday boards are read from their sitemaps.`
    )
  if (skippedPlanned)
    await log(
      args.searchRunId,
      `Skipped ${skippedPlanned} Greenhouse EU hits. That host is unverified and is not called.`
    )
  return { provider, added, skippedPolish, skippedWorkday, skippedPlanned, pages }
}

function addBoard(
  boards: Map<string, BoardTarget>,
  provider: SourceType,
  boardId: string,
  disabled: Set<string>
): number {
  if (disabled.has(providerName(provider))) return 0
  const discovered = Array.from(boards.values()).filter((board) => board.origin === "search").length
  if (discovered >= MAX_DISCOVERED) return 0
  const key = boardKey(provider, boardId)
  if (boards.has(key)) return 0
  boards.set(key, {
    provider,
    boardId,
    companyName: boardId,
    careersUrl: careerUrl(provider, boardId),
    apiUrl: careerUrl(provider, boardId),
    openJobsAtCheck: 0,
    plLocatedJobs: 0,
    identityConfirmed: false,
    priority: 0,
    origin: "search",
  })
  return 1
}

async function resolveWorkableSlug(url: string, http: HttpClient): Promise<string | null> {
  try {
    const response = await http.get(url, { maxBytes: 1_500_000, accept: "text/html" })
    if (response.status >= 400) return null
    return workableSlugFromHtml(response.body)
  } catch {
    return null
  }
}

async function readJsonLdPages(
  pages: string[],
  http: HttpClient,
  searchRunId: string,
  provider: string
): Promise<ListedJob[]> {
  const jobs: ListedJob[] = []
  for (const pageUrl of pages) {
    const classified = classifyHit(pageUrl)
    if (classified.kind !== "other") continue
    try {
      const response = await http.get(pageUrl, { maxBytes: 1_500_000, accept: "text/html" })
      if (response.status >= 400) continue
      let sourceType: SourceType | undefined
      let boardId: string | undefined
      try {
        const host = new URL(pageUrl).hostname.toLowerCase()
        if (host === "synerise.com" || host.endsWith(".synerise.com")) {
          sourceType = "CAREER_SITE"
          boardId = host
        }
      } catch {
        sourceType = undefined
      }
      const found = parseJsonLdJobs(response.body, response.url, undefined, {
        provider,
        sourceType,
        boardId,
      })
      jobs.push(...found)
      if (found.length)
        await log(searchRunId, `JSON-LD: ${found.length} postings from a company page`)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Page skipped"
      await log(searchRunId, message, "warn")
    }
  }
  return jobs
}

function overlap(title: string, expansion: QueryExpansion): number {
  return titleIsRelevant(title, expansion) ? title.length : 0
}

function isLiveAts(value: SourceType): value is LiveAts {
  return value !== "GENERIC_HTML" && value !== "WEB_SEARCH"
}

function scopedExternalId(job: ListedJob): string | undefined {
  if (!job.externalId) return undefined
  if (!SCOPED_ATS.has(job.sourceType)) return job.externalId
  const board = (job.sourceBoardId ?? "board").toLowerCase()
  return job.externalId.toLowerCase().startsWith(`${board}:`)
    ? job.externalId
    : `${board}:${job.externalId}`
}

function rawId(job: ListedJob): string {
  return `${APP_TO_SOURCE[job.sourceType] ?? "web"}:${job.sourceBoardId ?? "board"}:${
    scopedExternalId(job) ?? job.originalUrl
  }`
}

function toRaw(job: ListedJob, now: Date): RawPosting | null {
  const source = APP_TO_SOURCE[job.sourceType]
  if (!source) return null
  try {
    new URL(job.originalUrl)
  } catch {
    return null
  }
  return {
    id: rawId(job),
    source,
    url: job.originalUrl,
    atsJobId: scopedExternalId(job),
    atsBoard: job.sourceBoardId,
    company: job.companyName || job.sourceBoardId || "Unknown company",
    title: job.title,
    location: job.locationText,
    workModeHint: job.workplaceType.toLowerCase(),
    salaryText: job.salaryText,
    description: (job.descriptionText ?? "").slice(0, 6000),
    postedAt: job.publishedAt ? job.publishedAt.toISOString() : undefined,
    fetchedAt: now.toISOString(),
  }
}

function breakdown(score: ScoreResult, posting: NormalizedPosting) {
  const salary = posting.salary
  return {
    band: score.band,
    gate: score.gate,
    components: score.components,
    penalties: score.penalties,
    assumptions: salary?.assumptions ?? [],
    monthlyPln: salary ? { min: salary.monthlyPlnMin, max: salary.monthlyPlnMax } : null,
  }
}

function workplaceOf(posting: NormalizedPosting): WorkplaceType {
  if (posting.location.workMode === "remote") return "REMOTE"
  if (posting.location.workMode === "hybrid") return "HYBRID"
  if (posting.location.workMode === "onsite") return "ONSITE"
  return "UNKNOWN"
}

async function upsertJob(args: {
  posting: NormalizedPosting
  listed?: ListedJob
  score: ScoreResult
  searchRunId: string
  now: Date
}) {
  const { posting, listed, score, searchRunId, now } = args
  const companyName = normalizeWhitespace(posting.raw.company)
  const normalizedName = normalizeCompanyName(companyName) || companyName.toLowerCase()
  let company = await db.company.findUnique({ where: { normalizedName } })
  if (!company) {
    try {
      company = await db.company.create({ data: { name: companyName, normalizedName } })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      company = await db.company.findUnique({ where: { normalizedName } })
      if (!company) throw error
    }
  }
  await db.companyAlias.upsert({
    where: {
      companyId_normalizedAlias: { companyId: company.id, normalizedAlias: normalizedName },
    },
    update: {},
    create: {
      companyId: company.id,
      alias: companyName,
      normalizedAlias: normalizedName,
      confidence: 1,
    },
  })

  const sourceType =
    listed && isLiveAts(listed.sourceType) ? listed.sourceType : SOURCE_TO_APP[posting.source]
  let careerPageId: string | undefined
  if (posting.raw.atsBoard && sourceType !== "GENERIC_HTML" && sourceType !== "WEB_SEARCH") {
    const url = careerUrl(sourceType, posting.raw.atsBoard)
    const page = await db.careerPage.upsert({
      where: {
        provider_providerBoardId: { provider: sourceType, providerBoardId: posting.raw.atsBoard },
      },
      update: {
        lastCheckedAt: now,
        lastSuccessfulFetchAt: now,
        lastErrorCode: null,
        resolutionStatus: "RESOLVED_ATS",
      },
      create: {
        companyId: company.id,
        url,
        normalizedUrl: appCanonicalUrl(url),
        provider: sourceType,
        providerBoardId: posting.raw.atsBoard,
        resolutionStatus: "RESOLVED_ATS",
        confidence: 0.9,
        lastCheckedAt: now,
        lastSuccessfulFetchAt: now,
      },
    })
    careerPageId = page.id
  }

  const description = excerpt(cleanDescription(posting.raw.description || ""))
  await rememberCompanyTech(company.id, { industry: company.industry, sourceType })
  const classified = await classificationFields(posting.raw.title, description)
  const range = posting.salary?.ranges[0]
  const salaryCurrency = range
    ? range.period === "month"
      ? range.currency
      : `${range.currency}/${range.period}`
    : undefined
  const identityKey = posting.atsKey || `url:${posting.canonicalUrl}`
  const data = {
    title: posting.raw.title,
    normalizedTitle: posting.titleNorm || posting.raw.title,
    summary: summarize(description || posting.raw.title),
    descriptionText: description,
    locationText: posting.raw.location,
    normalizedLocation: posting.location.cities[0]
      ? `${posting.location.cities[0].city}, ${posting.location.cities[0].country}`
      : posting.raw.location,
    ...searchCountryFields(posting.raw.location, workplaceOf(posting), listed?.countryCodes),
    workplaceType: workplaceOf(posting),
    employmentType: listed?.employmentType,
    salaryMin: range?.min ?? undefined,
    salaryMax: range?.max ?? undefined,
    salaryCurrency,
    originalUrl: posting.raw.url,
    canonicalUrl: posting.canonicalUrl,
    publishedAt: posting.postedAt ? new Date(posting.postedAt) : undefined,
    lastSeenAt: now,
    lastVerifiedAt: now,
    status: "ACTIVE" as const,
    contentHash: sha256(description.slice(0, 2000) || posting.fingerprint),
    fingerprint: posting.fingerprint,
    sourceType,
    sourceBoardId: posting.raw.atsBoard,
    externalId: posting.raw.atsJobId,
    careerPageId,
    llmOptOut: listed?.llmOptOut ?? false,
    ...classified,
    ...(listed?.variants ? { variants: listed.variants as unknown as Prisma.InputJsonValue } : {}),
  }
  let record = await db.job.findUnique({ where: { identityKey } })
  if (!record) {
    record = await db.job.findFirst({
      where: { fingerprint: posting.fingerprint, companyId: company.id },
    })
  }
  const written = keepExternalPay(record, data)
  if (record) {
    const taken =
      record.identityKey === identityKey
        ? null
        : await db.job.findUnique({ where: { identityKey } })
    record = await db.job.update({
      where: { id: record.id },
      data: taken && taken.id !== record.id ? written : { ...written, identityKey },
    })
  } else {
    try {
      record = await db.job.create({
        data: { ...written, companyId: company.id, identityKey, firstSeenAt: now },
      })
    } catch (error) {
      if (!isUniqueViolation(error)) throw error
      const again = await db.job.findUnique({ where: { identityKey } })
      record = await db.job.update({ where: { identityKey }, data: keepExternalPay(again, data) })
    }
  }
  await db.jobObservation.create({
    data: {
      jobId: record.id,
      careerPageId,
      searchRunId,
      contentHash: posting.fingerprint,
      fetchStatus: "HEALTHY",
      evidence: {
        title: posting.raw.title,
        sourceType,
        url: posting.canonicalUrl,
        score: score.score,
        band: score.band,
      },
    },
  })
  return record
}

function careerUrl(provider: SourceType, boardId: string): string {
  if (provider === "GREENHOUSE") return `https://job-boards.greenhouse.io/${boardId}`
  if (provider === "LEVER") {
    if (boardId.toLowerCase().startsWith("eu:"))
      return `https://jobs.eu.lever.co/${encodeURIComponent(boardId.slice(3))}`
    return `https://jobs.lever.co/${encodeURIComponent(boardId)}`
  }
  if (provider === "ASHBY") return `https://jobs.ashbyhq.com/${boardId}`
  if (provider === "WORKABLE") return `https://apply.workable.com/${boardId}`
  if (provider === "SMARTRECRUITERS") return `https://jobs.smartrecruiters.com/${boardId}`
  if (provider === "TEAMTAILOR") return `https://${tenantHost(boardId, "teamtailor.com")}/jobs`
  if (provider === "RECRUITEE") return `https://${tenantHost(boardId, "recruitee.com")}/`
  if (provider === "PERSONIO") return `https://${tenantHost(boardId, "jobs.personio.de")}/`
  if (provider === "TRAFFIT") return `https://${tenantHost(boardId, "traffit.com")}/career/`
  if (provider === "PINPOINT") return `https://${tenantHost(boardId, "pinpointhq.com")}/`
  if (provider === "BREEZY") return `https://${tenantHost(boardId, "breezy.hr")}/`
  if (provider === "BAMBOOHR") return `https://${tenantHost(boardId, "bamboohr.com")}/careers`
  if (provider === "SUCCESSFACTORS" || provider === "CAREER_SITE")
    return `https://${boardId.replace(/^https?:\/\//, "")}/`
  if (provider === "WORKDAY") {
    const match = boardId.match(/^([^/]+)\/wd(\d+)\/(.+)$/i)
    if (match) return `https://${match[1]}.wd${match[2]}.myworkdayjobs.com/${match[3]}`
  }
  return `https://example.com/${boardId}`
}

/** The same country columns a board read writes, for an offer a search found. */
function searchCountryFields(
  locationText: string | undefined,
  workplaceType: string,
  structured: string[] | undefined
) {
  const place = resolveJobCountries({ locationText, workplaceType, structured })
  return {
    countries: place.countries,
    countryCode: place.countries[0] ?? null,
    remoteRegions: place.remoteRegions,
    countrySource: place.source,
  }
}
