/**
 * "Podobne do …": open offers that resemble one liked offer (or all likes). The database narrows
 * 16k rows to a candidate pool by whole-word title / skill / company matches, then every candidate
 * is scored in memory against each seed on title, skills, company, industry, work mode, city,
 * seniority, salary band, contract and the tags the person picked.
 */
import { Prisma } from "@prisma/client"
import db from "db"
import { tokens } from "matching/text"
import { SENIORITY_RANK } from "matching/types"
import { offerPayFields } from "src/server/jobs/offer-facts"
import { INDUSTRY_GROUPS } from "src/server/profile/industry"
import { parseAspects, type FeedbackAspect } from "src/shared/feedback-aspects"
import { splitStoredTags } from "./feedback"
import {
  industryLabel,
  offerHasKey,
  offerText,
  profileOffer,
  skillLabel,
  tagToFact,
  titleSimilarity,
  type OfferProfile,
} from "./facts"
import {
  buildPreferenceModel,
  decay,
  feedbackJobSelect,
  jobToOffer,
  preferenceAdjustment,
} from "./model"
import type { Bilingual, Locale, OfferForScoring, PreferenceModel, RankedOffer } from "./types"

export const SIMILAR_POOL = 1500
const MAX_SEEDS = 25
const MIN_SCORE = 25

const ASPECT_NAME: Record<FeedbackAspect, Bilingual> = {
  role: { pl: "stanowisko", en: "role" },
  stack: { pl: "technologie", en: "tech stack" },
  seniority: { pl: "poziom", en: "seniority" },
  salary: { pl: "wynagrodzenie", en: "salary" },
  remote: { pl: "tryb pracy", en: "work mode" },
  location: { pl: "lokalizacja", en: "location" },
  company: { pl: "firma", en: "company" },
  industry: { pl: "branża", en: "industry" },
  scope: { pl: "zakres pracy", en: "scope" },
  contract: { pl: "umowa", en: "contract" },
}

export type Seed = {
  jobId: string
  title: string
  company: string
  companyId: string
  offer: OfferProfile
  /** Recency weight in (0, 1]. */
  weight: number
  /** Aspects that count double for this seed. */
  aspects: FeedbackAspect[]
  /** Fact keys the person picked as tags. */
  tagKeys: string[]
}

export type Similarity = { score: number; reasons: Bilingual[] }

function sameGroup(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  return INDUSTRY_GROUPS.some((group) => group.includes(a) && group.includes(b))
}

/** Pure: how much a candidate resembles one seed, 0–99, with the reasons that carried it. */
export function similarity(seed: Seed, candidate: OfferProfile, candidateText: string): Similarity {
  const boost = (aspect: FeedbackAspect) => (seed.aspects.includes(aspect) ? 2 : 1)
  const parts: { points: number; reason: Bilingual | null }[] = []

  const dice = titleSimilarity(candidate.titleTokens, seed.offer.titleTokens)
  const sameRole = Boolean(seed.offer.roleKey && seed.offer.roleKey === candidate.roleKey)
  const titlePoints = (dice * 35 + (sameRole ? 5 : 0)) * boost("role")
  if (titlePoints > 0) {
    parts.push({
      points: titlePoints,
      reason: dice >= 0.5 ? { pl: "Podobne stanowisko", en: "Similar role" } : null,
    })
  }

  const shared = seed.offer.skills.filter((id) => candidate.skills.includes(id))
  if (shared.length) {
    const labels = shared.slice(0, 3).map(skillLabel).join(", ")
    parts.push({
      points: Math.min(20, 8 * shared.length) * boost("stack"),
      reason: { pl: `Wspólny stack: ${labels}`, en: `Shared stack: ${labels}` },
    })
  }

  if (seed.offer.companyKey && seed.offer.companyKey === candidate.companyKey) {
    parts.push({
      points: 8 * boost("company"),
      reason: { pl: `Ta sama firma: ${seed.company}`, en: `Same company: ${seed.company}` },
    })
  }

  if (seed.offer.industry && seed.offer.industry === candidate.industry) {
    const label = industryLabel(seed.offer.industry)
    parts.push({
      points: 8 * boost("industry"),
      reason: { pl: `Ta sama branża: ${label.pl}`, en: `Same industry: ${label.en}` },
    })
  } else if (sameGroup(seed.offer.industry, candidate.industry)) {
    parts.push({ points: 4 * boost("industry"), reason: null })
  }

  if (seed.offer.workMode !== "unknown" && seed.offer.workMode === candidate.workMode) {
    const label: Record<string, Bilingual> = {
      remote: { pl: "Też zdalnie", en: "Also remote" },
      hybrid: { pl: "Też hybrydowo", en: "Also hybrid" },
      onsite: { pl: "Też stacjonarnie", en: "Also on-site" },
    }
    parts.push({ points: 6 * boost("remote"), reason: label[seed.offer.workMode] ?? null })
  }

  if (seed.offer.city && seed.offer.city === candidate.city) {
    parts.push({
      points: 4 * boost("location"),
      reason: { pl: `Też ${seed.offer.city}`, en: `Also ${seed.offer.city}` },
    })
  }

  if (seed.offer.seniority && candidate.seniority) {
    const gap = Math.abs(SENIORITY_RANK[seed.offer.seniority] - SENIORITY_RANK[candidate.seniority])
    if (gap === 0) {
      parts.push({
        points: 8 * boost("seniority"),
        reason: { pl: "Ten sam poziom", en: "Same level" },
      })
    } else if (gap === 1) {
      parts.push({ points: 4 * boost("seniority"), reason: null })
    }
  }

  if (seed.offer.monthly && candidate.monthly) {
    const a = (seed.offer.monthly.min + seed.offer.monthly.max) / 2
    const b = (candidate.monthly.min + candidate.monthly.max) / 2
    const ratio = Math.min(a, b) / Math.max(a, b)
    if (ratio >= 0.85) {
      parts.push({
        points: 8 * boost("salary"),
        reason: { pl: "Podobne widełki", en: "Similar pay" },
      })
    } else if (ratio >= 0.7) {
      parts.push({ points: 4 * boost("salary"), reason: null })
    }
    if (seed.aspects.includes("salary") && candidate.monthly.max < a * 0.8) {
      parts.push({ points: -6, reason: null })
    }
  }

  if (seed.offer.contracts.some((id) => candidate.contracts.includes(id))) {
    parts.push({ points: 3 * boost("contract"), reason: null })
  }

  let tagPoints = 0
  for (const key of seed.tagKeys) {
    if (tagPoints >= 12) break
    if (offerHasKey(candidate, key, candidateText)) tagPoints += 4
  }
  if (tagPoints) parts.push({ points: tagPoints, reason: null })

  const raw = parts.reduce((sum, part) => sum + part.points, 0)
  const reasons = parts
    .filter((part) => part.reason && part.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
    .map((part) => part.reason!)
  return { score: Math.max(0, Math.min(99, Math.round(raw))), reasons }
}

/** A candidate needs a real link to the seed: similar title, two shared skills, or the same company with some title overlap. */
export function related(seed: Seed, candidate: OfferProfile): boolean {
  const dice = titleSimilarity(candidate.titleTokens, seed.offer.titleTokens)
  if (dice >= 0.34) return true
  const shared = seed.offer.skills.filter((id) => candidate.skills.includes(id)).length
  if (shared >= 2) return true
  // One shared skill is enough when the stack is what the person liked, or the seed names few skills.
  if (shared >= 1 && (seed.aspects.includes("stack") || seed.offer.skills.length <= 2)) return true
  return Boolean(
    seed.offer.companyKey && seed.offer.companyKey === candidate.companyKey && dice > 0
  )
}

/** Best seed wins; an older like counts a little less. */
export function scoreAgainstSeeds(
  seeds: Seed[],
  candidate: OfferProfile,
  candidateText: string
): Similarity & { seed: Seed | null } {
  let best: Similarity & { seed: Seed | null } = { score: 0, reasons: [], seed: null }
  for (const seed of seeds) {
    if (!related(seed, candidate)) continue
    const result = similarity(seed, candidate, candidateText)
    const score = Math.round(result.score * (0.7 + 0.3 * seed.weight))
    if (score > best.score) best = { score, reasons: result.reasons, seed }
  }
  return best
}

function regexWord(token: string): string {
  return `\\m${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\M`
}

const GENERIC = new Set([
  "engineer",
  "developer",
  "specialist",
  "manager",
  "lead",
  "senior",
  "analyst",
])
const LEVEL_WORDS = new Set([
  "senior",
  "junior",
  "mid",
  "regular",
  "staff",
  "principal",
  "and",
  "the",
  "for",
])

/** Title words and skills to narrow the pool. Specific words first, generic ones last. */
export function poolTerms(seeds: Seed[]): { title: string[]; skills: string[] } {
  const title = new Map<string, number>()
  for (const seed of seeds) {
    // Normalized tokens (Polish words mapped to English) plus the raw words as written.
    const words = new Set([
      ...seed.offer.titleTokens,
      ...tokens(seed.title).filter((token) => token.length >= 3 && !LEVEL_WORDS.has(token)),
    ])
    for (const token of words) {
      if (token.length < 2 || /^\d+$/.test(token)) continue
      title.set(token, (title.get(token) ?? 0) + seed.weight)
    }
  }
  const skills = new Map<string, number>()
  for (const seed of seeds) {
    for (const id of seed.offer.skills) skills.set(id, (skills.get(id) ?? 0) + seed.weight)
  }
  const rank = (entries: Map<string, number>) =>
    [...entries.entries()]
      .sort((a, b) => Number(GENERIC.has(a[0])) - Number(GENERIC.has(b[0])) || b[1] - a[1])
      .map(([token]) => token)
  return { title: rank(title).slice(0, 12), skills: rank(skills).slice(0, 6) }
}

async function candidateIds(seeds: Seed[], excluded: string[]): Promise<string[]> {
  const terms = poolTerms(seeds)
  const titlePatterns = terms.title.map(regexWord)
  const skillPatterns = terms.skills.flatMap((id) => {
    const label = skillLabel(id).toLowerCase()
    return label.length >= 2 ? [regexWord(label)] : []
  })
  const companies = [...new Set(seeds.map((seed) => seed.companyId))]
  const none = ["__none__"]
  const rank = [
    ...terms.title.map(
      (token, index) =>
        Prisma.sql`(CASE WHEN j.title ~* ${titlePatterns[index]} THEN ${Prisma.raw(
          GENERIC.has(token) ? "1" : "2"
        )} ELSE 0 END)`
    ),
    ...skillPatterns.map(
      (pattern) => Prisma.sql`(CASE WHEN j.title ~* ${pattern} THEN 2 ELSE 0 END)`
    ),
    Prisma.sql`(CASE WHEN j."companyId" = ANY(${companies}) THEN 1 ELSE 0 END)`,
  ]
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT j.id FROM "Job" j
    WHERE j.status IN ('ACTIVE', 'POSSIBLY_CLOSED')
      AND NOT (j.id = ANY(${excluded.length ? excluded : none}))
      AND (
        j.title ~* ANY(${titlePatterns.length ? titlePatterns : none})
        OR j."companyId" = ANY(${companies.length ? companies : none})
        OR j."descriptionText" ~* ANY(${skillPatterns.length ? skillPatterns : none})
      )
    ORDER BY (${Prisma.join(rank, " + ")}) DESC, j."lastSeenAt" DESC
    LIMIT ${SIMILAR_POOL}
  `
  return rows.map((row) => row.id)
}

const seedSelect = { ...feedbackJobSelect, companyId: true } as const

function makeSeed(
  job: Prisma.JobGetPayload<{ select: typeof seedSelect }>,
  weight: number,
  aspects: FeedbackAspect[],
  tags: string[]
): Seed {
  const offer = profileOffer(jobToOffer(job))
  const tagKeys = tags.flatMap((tag) => {
    const fact = tagToFact(tag, offer.facts)
    return fact ? [fact.key] : []
  })
  return {
    jobId: job.id,
    title: job.title,
    company: job.company.name,
    companyId: job.companyId,
    offer,
    weight,
    aspects,
    tagKeys: [...new Set(tagKeys)],
  }
}

async function loadSeeds(input: {
  userId: number
  jobId?: string
  aspects?: FeedbackAspect[]
}): Promise<Seed[]> {
  const override = input.aspects ? parseAspects(input.aspects) : null
  if (input.jobId) {
    const [job, feedback] = await Promise.all([
      db.job.findUnique({ where: { id: input.jobId }, select: seedSelect }),
      db.offerFeedback.findUnique({
        where: { userId_jobId: { userId: input.userId, jobId: input.jobId } },
        select: { aspects: true, tags: true },
      }),
    ])
    if (!job) return []
    const tags = splitStoredTags(feedback?.tags).tags
    return [makeSeed(job, 1, override ?? parseAspects(feedback?.aspects), tags)]
  }
  const rows = await db.offerFeedback.findMany({
    where: { userId: input.userId, verdict: { in: ["LIKE", "APPLIED"] } },
    orderBy: { updatedAt: "desc" },
    take: MAX_SEEDS,
    select: { aspects: true, tags: true, updatedAt: true, job: { select: seedSelect } },
  })
  // the newest seed weighs 1; older ones fade with the preference model's half-life
  const newest = new Date(rows[0]?.updatedAt.getTime() ?? Date.now())
  return rows.map((row) => {
    const weight = decay(row.updatedAt, newest)
    const tags = splitStoredTags(row.tags).tags
    return makeSeed(row.job, weight, override ?? parseAspects(row.aspects), tags)
  })
}

function basisText(
  seeds: Seed[],
  jobId: string | undefined,
  aspects: FeedbackAspect[] | undefined,
  locale: Locale
): string {
  if (!seeds.length) {
    return locale === "en" ? "No liked offers yet" : "Brak polubionych ofert"
  }
  const head = jobId
    ? locale === "en"
      ? `Similar to: ${seeds[0].title} (${seeds[0].company})`
      : `Podobne do: ${seeds[0].title} (${seeds[0].company})`
    : locale === "en"
    ? `Based on ${seeds.length} ${seeds.length === 1 ? "offer" : "offers"} you liked`
    : `Na podstawie ${seeds.length} ${
        seeds.length === 1 ? "polubionej oferty" : "polubionych ofert"
      }`
  const picked = aspects?.length ? aspects : jobId ? seeds[0].aspects : []
  if (!picked.length) return head
  const names = picked.map((aspect) => ASPECT_NAME[aspect][locale]).join(", ")
  return `${head} · ${locale === "en" ? "focus" : "nacisk"}: ${names}`
}

/** Ranks scored candidates. Pure, so tests can feed it rows without a database. */
export function rankCandidates(args: {
  seeds: Seed[]
  candidates: (OfferForScoring & {
    id: string
    url: string
    salaryLabel: string | null
    viaIntermediary?: boolean
  })[]
  model: PreferenceModel | null
  locale: Locale
  limit: number
}): RankedOffer[] {
  const ranked: RankedOffer[] = []
  for (const candidate of args.candidates) {
    const profile = profileOffer(candidate)
    const text = offerText(candidate)
    const match = scoreAgainstSeeds(args.seeds, profile, text)
    if (!match.seed || match.score < MIN_SCORE) continue
    const reasonsI18n = [...match.reasons]
    let score = match.score
    if (args.model) {
      const adjustment = preferenceAdjustment(args.model, candidate, profile)
      // Passes pull hard; likes are already what the seed measures, so they add half.
      score += adjustment.delta < 0 ? adjustment.delta : Math.round(adjustment.delta / 2)
      if (adjustment.delta < 0) reasonsI18n.push(...adjustment.reasonsI18n.slice(0, 1))
    }
    score = Math.max(1, Math.min(100, score))
    ranked.push({
      id: candidate.id,
      title: candidate.title,
      company: candidate.company,
      viaIntermediary: candidate.viaIntermediary ?? false,
      location: profile.city ?? candidate.locationText ?? null,
      workplace: profile.workMode,
      salary: candidate.salaryLabel,
      url: candidate.url,
      score,
      reasonsI18n,
      reasons: reasonsI18n.map((item) => (args.locale === "en" ? item.en : item.pl)),
    })
  }
  ranked.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
  // The same role at the same company is often posted once per city: keep the best one.
  const seen = new Set<string>()
  const unique: RankedOffer[] = []
  for (const offer of ranked) {
    const key = `${tokens(offer.title).join(" ")}|${tokens(offer.company).join(" ")}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(offer)
    if (unique.length >= args.limit) break
  }
  return unique
}

export async function findSimilarOffers(input: {
  userId: number
  jobId?: string
  limit?: number
  aspects?: FeedbackAspect[]
  locale?: Locale
}): Promise<{ offers: RankedOffer[]; basis: string }> {
  const limit = Math.max(1, Math.min(50, Math.round(input.limit ?? 12)))
  const [seeds, model] = await Promise.all([loadSeeds(input), buildPreferenceModel(input.userId)])
  const locale = input.locale ?? model.locale
  const basis = basisText(seeds, input.jobId, input.aspects, locale)
  if (!seeds.length) return { offers: [], basis }
  const excluded = [...new Set([...model.decided, ...seeds.map((seed) => seed.jobId)])]
  const ids = await candidateIds(seeds, excluded)
  if (!ids.length) return { offers: [], basis }
  const rows = await db.job.findMany({
    where: { id: { in: ids } },
    select: {
      ...feedbackJobSelect,
      originalUrl: true,
      canonicalUrl: true,
      salarySourceUrl: true,
      viaIntermediary: true,
    },
  })
  const candidates = rows.map((row) => ({
    ...jobToOffer(row),
    id: row.id,
    viaIntermediary: row.viaIntermediary,
    url: row.originalUrl || row.canonicalUrl,
    salaryLabel: offerPayFields(row, locale).card.payLabel,
  }))
  return { offers: rankCandidates({ seeds, candidates, model, locale, limit }), basis }
}
