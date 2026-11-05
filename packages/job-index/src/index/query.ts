import { Prisma } from "@prisma/client"
import db from "../db"
import { runMatching } from "@newrole/matching/pipeline"
import type { QueryExpansion } from "@newrole/matching/query-expansion.schema"
import type { RawPosting } from "@newrole/matching/types"
import { createLlmClient, type LlmClient } from "../llm"
import { explainMatch } from "../matching/explain"
import { liveMatchingConfig, liveProfile, titleIsRelevant } from "../matching/live"
import { APP_TO_SOURCE } from "@newrole/ats/sources"
import { extractJobIndustry } from "@newrole/profile/industry"
import { rankAgainstProfile, toSignals, bandFor } from "../profile/rank"
import type { SourceType } from "@newrole/ats/schemas"
import { countryFromQuery } from "../jobs/offer-facts"

export const RELEVANCE_FLOOR = 40
/** Industry extraction may call the model for this many matches per run; the rest use rules. */
const INDUSTRY_LLM_BUDGET = 20

function salaryText(job: {
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
}): string | undefined {
  if (job.salaryMin == null && job.salaryMax == null) return undefined
  const currency = job.salaryCurrency ? ` ${job.salaryCurrency}` : ""
  if (job.salaryMin != null && job.salaryMax != null && job.salaryMin !== job.salaryMax) {
    return `${job.salaryMin}–${job.salaryMax}${currency}`
  }
  return `${job.salaryMin ?? job.salaryMax}${currency}`
}

function toRaw(
  job: {
    id: string
    title: string
    locationText: string | null
    workplaceType: string
    descriptionText: string
    originalUrl: string
    canonicalUrl: string
    publishedAt: Date | null
    sourceType: SourceType
    sourceBoardId: string | null
    externalId: string | null
    salaryMin: number | null
    salaryMax: number | null
    salaryCurrency: string | null
    company: { name: string }
  },
  now: Date
): RawPosting | null {
  const source = APP_TO_SOURCE[job.sourceType]
  if (!source) return null
  return {
    id: job.id,
    source,
    url: job.canonicalUrl || job.originalUrl,
    atsJobId: job.externalId ?? undefined,
    atsBoard: job.sourceBoardId ?? undefined,
    company: job.company.name,
    title: job.title,
    location: job.locationText ?? undefined,
    workModeHint: job.workplaceType.toLowerCase(),
    salaryText: salaryText(job),
    description: job.descriptionText.slice(0, 4000),
    postedAt: job.publishedAt ? job.publishedAt.toISOString() : undefined,
    fetchedAt: now.toISOString(),
  }
}

/** Scores every active indexed job and writes one match row per offer at or above the floor. */
export async function publishIndexedMatches(args: {
  searchRunId: string
  savedSearchId: string
  expansion: QueryExpansion
  now: Date
  llm?: LlmClient | null
  floor?: number
}): Promise<number> {
  const floor = args.floor ?? RELEVANCE_FLOOR
  // Titles first, then the full rows of the relevant ones: the whole index no longer has to sit in
  // memory (95,758 rows with descriptions took 4.4 s and about 1 GB on 2026-11-03).
  const open = { status: { in: ["ACTIVE" as const, "POSSIBLY_CLOSED" as const] } }
  const titles = await db.job.findMany({ where: open, select: { id: true, title: true } })
  const relevant = titles
    .filter((job) => titleIsRelevant(job.title, args.expansion))
    .map((job) => job.id)
  const jobs = []
  for (let start = 0; start < relevant.length; start += 1000) {
    jobs.push(
      ...(await db.job.findMany({
        where: { ...open, id: { in: relevant.slice(start, start + 1000) } },
        include: { company: true },
      }))
    )
  }
  const raws = jobs.flatMap((job) => {
    const raw = toRaw(job, args.now)
    return raw ? [raw] : []
  })
  if (!raws.length) return 0
  const hint = await db.savedSearch.findUnique({
    where: { id: args.savedSearchId },
    select: { locationHint: true },
  })
  const profile = liveProfile(args.expansion, {
    country: countryFromQuery(hint?.locationHint ?? ""),
  })
  const config = liveMatchingConfig()
  const matched = runMatching(raws, profile, args.now, config)
  const saved = await db.savedSearch.findUnique({
    where: { id: args.savedSearchId },
    select: {
      userId: true,
      user: {
        select: {
          locale: true,
          candidateProfile: true,
        },
      },
    },
  })
  const signals = saved?.user.candidateProfile
    ? toSignals(saved.user.candidateProfile, saved.user.locale)
    : null
  const byId = new Map(matched.postings.map((posting) => [posting.id, posting]))
  const jobById = new Map(jobs.map((job) => [job.id, job]))
  const ranked = matched.ranked.filter((score) => score.score >= floor)
  const prior = await db.jobMatch.findMany({
    where: {
      savedSearchId: args.savedSearchId,
      searchRun: { status: "SUCCEEDED", id: { not: args.searchRunId } },
    },
    select: { jobId: true },
  })
  const seen = new Set(prior.map((match) => match.jobId))
  const hadPrior = prior.length > 0
  const llm = args.llm === undefined ? createLlmClient() : args.llm
  let index = 0
  let industryBudget = llm ? INDUSTRY_LLM_BUDGET : 0
  for (const score of ranked) {
    const posting = byId.get(score.postingId)
    if (!posting) continue
    const job = jobById.get(score.postingId)
    let fit: ReturnType<typeof rankAgainstProfile> | null = null
    if (signals) {
      const useLlm = llm && industryBudget > 0 && !job?.llmOptOut ? llm : null
      if (useLlm) industryBudget -= 1
      const jobIndustry = await extractJobIndustry(
        job?.title ?? posting.titleNorm,
        job?.descriptionText ?? posting.raw.description ?? "",
        useLlm
      )
      const salary =
        posting.salary &&
        (posting.salary.monthlyPlnMin != null || posting.salary.monthlyPlnMax != null)
          ? { min: posting.salary.monthlyPlnMin, max: posting.salary.monthlyPlnMax }
          : null
      fit = rankAgainstProfile({
        queryScore: score.score,
        signals,
        config,
        title: job?.title ?? "",
        description: job?.descriptionText ?? "",
        location: job?.locationText ?? "",
        workplace: job?.workplaceType ?? "",
        salary,
        seniority: job?.seniorityLevel,
        jobIndustry,
      })
    }
    const reason = fit
      ? fit.why
      : (
          await explainMatch({
            llm,
            posting,
            score,
            profile,
            index,
            llmOptOut: job?.llmOptOut ?? false,
            userId: saved?.userId,
          })
        ).reason
    index += 1
    const isNew = hadPrior && !seen.has(score.postingId)
    const data = {
      score: fit ? fit.score : score.score,
      scoreBreakdown: {
        band: fit ? bandFor(fit.score) : score.band,
        gate: score.gate,
        components: score.components,
        penalties: score.penalties,
        queryScore: score.score,
        ...(fit
          ? {
              profile: {
                why: fit.why,
                salaryDelta: fit.salaryDelta,
                industryDelta: fit.industryDelta,
                disclosed: fit.disclosed,
                monthlyMin: fit.monthlyMin,
                monthlyMax: fit.monthlyMax,
                industry: fit.industry,
                requirement: fit.requirement,
                relation: fit.relation,
              },
            }
          : {}),
      } as unknown as Prisma.InputJsonValue,
      reason,
      isNew,
      fitIndustry: fit?.industry ?? null,
      fitSalaryMonthly: fit?.salaryMonthly ?? null,
    }
    await db.jobMatch.upsert({
      where: { jobId_searchRunId: { jobId: score.postingId, searchRunId: args.searchRunId } },
      update: data,
      create: {
        ...data,
        jobId: score.postingId,
        savedSearchId: args.savedSearchId,
        searchRunId: args.searchRunId,
      },
    })
  }
  return ranked.length
}
