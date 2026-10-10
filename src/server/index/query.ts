import { Prisma } from "@prisma/client"
import db from "db"
import {
  fallbackExplanation,
  finalizeExplanation,
  buildMatchExplanationMessages,
} from "../../../matching/match-explanation.schema"
import { runMatching } from "../../../matching/pipeline"
import type { QueryExpansion } from "../../../matching/query-expansion.schema"
import type { ScoreResult } from "../../../matching/scoring"
import type { NormalizedPosting, RawPosting, Source } from "../../../matching/types"
import { createLlmClient, type LlmClient } from "src/server/llm/client"
import { liveMatchingConfig, liveProfile, titleIsRelevant } from "src/server/matching/live"
import { extractJobIndustry } from "src/server/profile/industry"
import { rankAgainstProfile, toSignals, bandFor } from "src/server/profile/rank"
import type { SourceType } from "src/shared/schemas"

export const RELEVANCE_FLOOR = 40

const APP_TO_SOURCE: Partial<Record<SourceType, Source>> = {
  GREENHOUSE: "greenhouse",
  LEVER: "lever",
  ASHBY: "ashby",
  WORKABLE: "workable",
  SMARTRECRUITERS: "smartrecruiters",
  TEAMTAILOR: "teamtailor",
  TRAFFIT: "company_site",
  RECRUITEE: "company_site",
  PERSONIO: "company_site",
  PINPOINT: "company_site",
  BREEZY: "company_site",
  BAMBOOHR: "company_site",
  GENERIC_HTML: "company_site",
  CAREER_SITE: "company_site",
  SUCCESSFACTORS: "company_site",
  WORKDAY: "company_site",
  ICIMS: "company_site",
  PHENOM: "company_site",
  AVATURE: "company_site",
  ERECRUITER: "company_site",
  JOBVITE: "company_site",
}

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

async function explain(
  llm: LlmClient | null,
  posting: NormalizedPosting,
  score: ScoreResult,
  profile: ReturnType<typeof liveProfile>,
  index: number,
  llmOptOut: boolean
) {
  if (!llm || index >= 6 || llmOptOut) return fallbackExplanation(score).summary.slice(0, 500)
  const messages = buildMatchExplanationMessages({ posting, score, profile, language: "en" })
  const system = messages.find((message) => message.role === "system")?.content ?? ""
  const user = messages.find((message) => message.role === "user")?.content ?? ""
  try {
    const result = await llm.completeText({
      purpose: "match-explanation",
      system,
      user,
      maxTokens: 900,
    })
    if (!result?.data) return fallbackExplanation(score).summary.slice(0, 500)
    return finalizeExplanation(result.data, score).explanation.summary.slice(0, 500)
  } catch {
    return fallbackExplanation(score).summary.slice(0, 500)
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
  const jobs = await db.job.findMany({
    where: { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } },
    include: { company: true },
  })
  const raws = jobs.flatMap((job) => {
    if (!titleIsRelevant(job.title, args.expansion)) return []
    const raw = toRaw(job, args.now)
    return raw ? [raw] : []
  })
  if (!raws.length) return 0
  const profile = liveProfile(args.expansion)
  const config = liveMatchingConfig()
  const matched = runMatching(raws, profile, args.now, config)
  const saved = await db.savedSearch.findUnique({
    where: { id: args.savedSearchId },
    select: {
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
  let industryBudget = llm ? 20 : 0
  for (const score of ranked) {
    const posting = byId.get(score.postingId)
    if (!posting) continue
    const job = jobs.find((item) => item.id === score.postingId)
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
        jobIndustry,
      })
    }
    const reason = fit
      ? fit.why
      : await explain(llm, posting, score, profile, index, job?.llmOptOut ?? false)
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
