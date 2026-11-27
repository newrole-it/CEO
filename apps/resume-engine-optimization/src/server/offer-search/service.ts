import db from "db"
import { parseEvaluation, type Decision } from "@newrole/cv-core/evaluation"
import type { LlmClient } from "@newrole/llm/common"
import type { CvLanguage } from "src/server/cv/service"
import { evaluateOffer } from "src/server/evaluation/service"
import { llmProvider } from "src/server/llm/client"
import { keepOffer } from "src/server/offers/service"
import type { HttpClient } from "src/server/security/safe-fetch"
import { filtersDiffer, SearchFilters } from "src/shared/offer-search"
import { filtersFromProfile, profilePatch } from "./filters"
import { OfferSearchError, startOfferSearch, type SearchCounts, type SearchDeps } from "./run"
import { rankResults } from "./screen"

/**
 * "Find offers": what the page shows of the person's latest search, and Add and Dismiss on one
 * result. Only the person's own rows are read; a result of another person is "not-found".
 */

export type SearchResultView = {
  id: string
  jobId: string | null
  url: string
  outcome: string
  reason: string | null
  factsByModel: boolean
  company: string | null
  title: string | null
  location: string | null
  /** The offer's pay as stored on the Job; salaryCurrency may carry a period ("PLN/month") */
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  publishedAt: Date | null
  decision: Decision | null
  score: number | null
  gaps: number
  topGap: string | null
  met: number | null
  required: number | null
  addedAt: Date | null
  rank: number | null
}

export type OfferSearchView = {
  available: boolean
  proposed: SearchFilters
  /** What the profile alone would propose, to compare an edited form with */
  profileFilters: SearchFilters
  differsFromProfile: boolean
  search: null | {
    id: string
    status: string
    errorCode: string | null
    filters: SearchFilters
    counts: SearchCounts
    createdAt: Date
    finishedAt: Date | null
    shown: SearchResultView[]
    weaker: SearchResultView[]
    unreadable: SearchResultView[]
  }
}

const resultSelect = {
  id: true,
  jobId: true,
  url: true,
  outcome: true,
  reason: true,
  factsByModel: true,
  decision: true,
  score: true,
  evaluation: true,
  addedAt: true,
  rank: true,
  job: {
    select: {
      title: true,
      locationText: true,
      salaryMin: true,
      salaryMax: true,
      salaryCurrency: true,
      publishedAt: true,
      company: { select: { name: true } },
    },
  },
} as const

type ResultRow = Awaited<ReturnType<typeof loadResults>>[number]

const loadResults = (searchId: string, userId: number) =>
  db.offerSearchResult.findMany({
    where: {
      searchId,
      userId,
      dismissedAt: null,
      outcome: { in: ["ok", "weaker", "unreadable"] },
    },
    select: resultSelect,
  })

const DECISIONS: Decision[] = ["apply", "consider", "skip", "unknown"]

function viewOf(row: ResultRow): SearchResultView {
  const evaluation = row.evaluation == null ? null : parseEvaluation(row.evaluation)
  const required = evaluation?.dimensions.requirements.required ?? null
  const job = row.job
  return {
    id: row.id,
    jobId: row.jobId,
    url: row.url,
    outcome: row.outcome,
    reason: row.reason,
    factsByModel: row.factsByModel,
    company: job?.company.name ?? null,
    title: job?.title ?? null,
    location: job?.locationText ?? null,
    salaryMin: job?.salaryMin ?? null,
    salaryMax: job?.salaryMax ?? null,
    salaryCurrency: job?.salaryCurrency ?? null,
    publishedAt: job?.publishedAt ?? null,
    decision: DECISIONS.find((decision) => decision === row.decision) ?? null,
    score: row.score,
    gaps: evaluation?.gaps.length ?? 0,
    topGap: evaluation?.gaps[0]?.text ?? null,
    met: required?.met ?? null,
    required: required?.total ?? null,
    addedAt: row.addedAt,
    rank: row.rank,
  }
}

export async function getOfferSearchView(userId: number): Promise<OfferSearchView> {
  const [profile, last] = await Promise.all([
    db.candidateProfile.findUnique({ where: { userId } }),
    db.offerSearch.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ])
  const profileFilters = filtersFromProfile(profile)
  const available = llmProvider() === "claude-cli"
  if (!last) {
    return {
      available,
      proposed: profileFilters,
      profileFilters,
      differsFromProfile: false,
      search: null,
    }
  }
  // a search stored before the filters were bounded like the profile may not parse: the form then
  // proposes the profile's filters instead of failing the page
  const stored = SearchFilters.safeParse(last.filters)
  const filters = stored.success ? stored.data : profileFilters
  const rows = (await loadResults(last.id, userId)).map(viewOf)
  return {
    available,
    proposed: filters,
    profileFilters,
    differsFromProfile: filtersDiffer(filters, profileFilters),
    search: {
      id: last.id,
      status: last.status,
      errorCode: last.errorCode,
      filters,
      counts: last.counts as SearchCounts,
      createdAt: last.createdAt,
      finishedAt: last.finishedAt,
      // ranks are written when the search ends; until then the evaluated ones show as they come
      shown:
        last.status === "done"
          ? rows
              .filter((row) => row.outcome === "ok" && row.rank != null)
              .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
          : rankResults(rows.filter((row) => row.outcome === "ok" && row.decision !== "skip")),
      weaker: rankResults(rows.filter((row) => row.outcome === "weaker")),
      unreadable: rows.filter((row) => row.outcome === "unreadable"),
    },
  }
}

/**
 * "Search" on the form. With `saveToProfile` the filters' profile fields go to the profile, checked
 * against the profile's own schema first, and written only once this search has started: not
 * without Claude Code (OfferSearchError "no-cli") and not when another search is still running
 * (its filters are the ones in use). The run reads only salaryTarget from the profile, which the
 * patch leaves alone, so writing just after the start changes nothing in the run.
 */
export async function startSearchFromForm(
  userId: number,
  input: { filters: SearchFilters; saveToProfile: boolean },
  locale: CvLanguage,
  deps: Partial<SearchDeps> = {}
): Promise<{ searchId: string; started: boolean }> {
  const patch = input.saveToProfile ? profilePatch(input.filters) : null
  const result = await startOfferSearch(userId, input.filters, locale, deps)
  if (patch && result.started) {
    await db.candidateProfile.upsert({
      where: { userId },
      create: { ...patch, userId },
      update: patch,
    })
  }
  return result
}

/** The person's own result, or OfferSearchError("not-found"). */
async function ownResult(userId: number, resultId: string) {
  const row = await db.offerSearchResult.findFirst({
    where: { id: resultId, userId },
    select: { id: true, jobId: true, addedAt: true },
  })
  if (!row) throw new OfferSearchError("not-found")
  return row
}

/**
 * Keeps the offer, evaluates it against the profile (the search's evaluation was made against the
 * filters; the model replies come from the cache) and marks the result added. Idempotent.
 */
export async function addSearchResult(
  userId: number,
  resultId: string,
  locale: CvLanguage,
  deps: { llm?: LlmClient | null; http?: HttpClient } = {}
): Promise<{ jobId: string }> {
  const row = await ownResult(userId, resultId)
  if (!row.jobId) throw new OfferSearchError("not-found")
  const { jobId } = row
  await keepOffer(userId, jobId)
  await evaluateOffer(userId, jobId, { locale, llm: deps.llm, http: deps.http })
  await db.offerSearchResult.updateMany({
    where: { id: resultId, userId, addedAt: null },
    data: { addedAt: new Date() },
  })
  return { jobId }
}

export async function dismissSearchResult(userId: number, resultId: string): Promise<void> {
  await ownResult(userId, resultId)
  await db.offerSearchResult.updateMany({
    where: { id: resultId, userId, dismissedAt: null },
    data: { dismissedAt: new Date() },
  })
}
