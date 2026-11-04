/**
 * The preference model: what a person's likes and passes say about the facts they care about.
 * Explicit and bounded. Each fact key gets a strength in (-1, 1); an offer's adjustment is the
 * sum of matching strengths × a fixed number of points per aspect, squashed into [-12, +12].
 */
import db from "db"
import { fold } from "@newrole/matching/text"
import { canonicalCity } from "src/server/jobs/offer-facts"
import { canonicalIndustry } from "src/server/profile/industry"
import { asStringList } from "src/server/profile/schema"
import {
  FEEDBACK_ASPECTS,
  parseAspects,
  type FeedbackAspect,
  type FeedbackVerdict,
} from "src/shared/feedback-aspects"
import { isVerdict, splitStoredTags, storedTags } from "./feedback"
import {
  offerHasKey,
  offerText,
  industryLabel,
  profileOffer,
  seniorityLabel,
  skillId,
  skillLabel,
  tagToFact,
  titleSimilarity,
  workLabel,
  type Fact,
  type OfferProfile,
} from "./facts"
import type {
  Bilingual,
  Locale,
  OfferForScoring,
  PreferenceAdjustment,
  PreferenceModel,
  PreferenceSignal,
  TasteItem,
  TitleSignal,
} from "./types"

export const DELTA_CAP = 12
export const HALF_LIFE_DAYS = 60
const MAX_ROWS = 300

const VERDICT_SIGN: Record<FeedbackVerdict, number> = { LIKE: 1, APPLIED: 1.25, DISLIKE: -1 }

/** Weight of a fact when the person picked nothing, picked its aspect, or picked the tag itself. */
export const IMPLICIT_WEIGHT = 0.35
export const ASPECT_WEIGHT = 0.6
export const TAG_WEIGHT = 1

/** Points one full-strength signal is worth, per aspect. */
export const ASPECT_POINTS: Record<FeedbackAspect, number> = {
  role: 3,
  stack: 2.5,
  seniority: 2,
  salary: 2,
  remote: 3,
  location: 2,
  company: 3,
  industry: 3,
  scope: 2,
  contract: 1.5,
}

const TITLE_POINTS = 4
const TITLE_MIN_DICE = 0.5
const PROFILE_STRENGTH = 0.3

export type FeedbackRow = {
  jobId: string
  verdict: FeedbackVerdict
  aspects: FeedbackAspect[]
  tags: string[]
  muted: string[]
  updatedAt: Date
  offer: OfferForScoring
}

export type ProfileInput = {
  skills: unknown
  industries: unknown
  seniority: string | null
  remotePreference: string | null
  homeCity: string | null
  locations: unknown
}

export function decay(updatedAt: Date, now: Date): number {
  const days = Math.max(0, (now.getTime() - updatedAt.getTime()) / 86_400_000)
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

/**
 * Which facts one feedback row teaches, with an unsigned weight:
 * nothing picked → every fact a little; tags picked → those tags fully; an aspect picked
 * without any of its tags → that aspect's facts. Muted keys teach nothing.
 */
export function rowContributions(
  row: Pick<FeedbackRow, "aspects" | "tags" | "muted">,
  offer: OfferProfile
): { fact: Fact; weight: number }[] {
  const muted = new Set(row.muted)
  const out = new Map<string, { fact: Fact; weight: number }>()
  const add = (fact: Fact, weight: number) => {
    if (muted.has(fact.key)) return
    const prev = out.get(fact.key)
    if (!prev || prev.weight < weight) out.set(fact.key, { fact, weight })
  }
  if (!row.tags.length && !row.aspects.length) {
    for (const fact of offer.facts) add(fact, IMPLICIT_WEIGHT)
    return [...out.values()]
  }
  const tagged = new Set<FeedbackAspect>()
  for (const tag of row.tags) {
    const fact = tagToFact(tag, offer.facts)
    if (!fact) continue
    tagged.add(fact.aspect)
    add(fact, TAG_WEIGHT)
  }
  for (const aspect of row.aspects) {
    if (tagged.has(aspect)) continue
    for (const fact of offer.facts) if (fact.aspect === aspect) add(fact, ASPECT_WEIGHT)
  }
  return [...out.values()]
}

/** "Similar to the one you liked" counts fully when the role mattered or nothing was picked. */
export function titleWeight(row: Pick<FeedbackRow, "aspects" | "tags">): number {
  if (!row.aspects.length && !row.tags.length) return 1
  return row.aspects.includes("role") ? 1 : 0.5
}

function emptyAspects(): Record<FeedbackAspect, number> {
  return Object.fromEntries(FEEDBACK_ASPECTS.map((aspect) => [aspect, 0])) as Record<
    FeedbackAspect,
    number
  >
}

function profileFacts(profile: ProfileInput): Fact[] {
  const facts: Fact[] = []
  for (const skill of asStringList(profile.skills)) {
    const id = skillId(skill)
    if (!id) continue
    facts.push({
      key: `skill:${id}`,
      aspect: "stack",
      label: { pl: skillLabel(id), en: skillLabel(id) },
    })
  }
  for (const industry of asStringList(profile.industries)) {
    const slug = canonicalIndustry(industry) ?? fold(industry).trim()
    if (slug)
      facts.push({ key: `industry:${slug}`, aspect: "industry", label: industryLabel(slug) })
  }
  const work = profile.remotePreference
  if (work === "remote" || work === "hybrid" || work === "onsite") {
    facts.push({ key: `work:${work}`, aspect: "remote", label: workLabel(work) })
  }
  for (const raw of [profile.homeCity, ...asStringList(profile.locations)]) {
    if (!raw?.trim()) continue
    const city = canonicalCity(raw) ?? raw.trim()
    facts.push({ key: `city:${fold(city)}`, aspect: "location", label: { pl: city, en: city } })
  }
  if (profile.seniority) {
    facts.push({
      key: `level:${profile.seniority}`,
      aspect: "seniority",
      label: seniorityLabel(profile.seniority),
    })
  }
  return facts
}

/** Pure: the model from feedback rows (newest first) and an optional profile. */
export function modelFromRows(args: {
  userId: number
  locale: Locale
  rows: FeedbackRow[]
  profile?: ProfileInput | null
  now?: Date
}): PreferenceModel {
  const now = args.now ?? new Date()
  type Entry = {
    fact: Fact
    sum: number
    from: PreferenceSignal["from"]
    likedJobIds: string[]
    dislikedJobIds: string[]
  }
  const sums = new Map<string, Entry>()
  const aspectSums = emptyAspects()
  const likedTitles: TitleSignal[] = []
  const dislikedTitles: TitleSignal[] = []
  let liked = 0
  let disliked = 0

  for (const row of args.rows) {
    const sign = VERDICT_SIGN[row.verdict]
    const age = decay(row.updatedAt, now)
    const offer = profileOffer(row.offer)
    if (sign > 0) liked += 1
    else disliked += 1
    for (const { fact, weight } of rowContributions(row, offer)) {
      const entry: Entry = sums.get(fact.key) ?? {
        fact,
        sum: 0,
        from: [],
        likedJobIds: [],
        dislikedJobIds: [],
      }
      entry.sum += sign * weight * age
      const ids = sign > 0 ? entry.likedJobIds : entry.dislikedJobIds
      if (ids.length < 50) ids.push(row.jobId)
      if (entry.from.length < 3) {
        entry.from.push({ jobId: row.jobId, title: row.offer.title, verdict: row.verdict })
      }
      sums.set(fact.key, entry)
    }
    for (const aspect of row.aspects) aspectSums[aspect] += sign * age
    if (offer.titleTokens.length) {
      const title: TitleSignal = {
        jobId: row.jobId,
        title: row.offer.title,
        tokens: offer.titleTokens,
        weight: titleWeight(row) * age * Math.abs(sign),
      }
      if (sign > 0) likedTitles.push(title)
      else dislikedTitles.push(title)
    }
  }

  const signals: PreferenceSignal[] = [...sums.values()]
    .map((entry) => ({
      key: entry.fact.key,
      aspect: entry.fact.aspect,
      label: entry.fact.label,
      strength: round3(Math.tanh(entry.sum / 1.5)),
      likes: entry.likedJobIds.length,
      dislikes: entry.dislikedJobIds.length,
      source: "feedback" as const,
      from: entry.from,
      likedJobIds: entry.likedJobIds,
      dislikedJobIds: entry.dislikedJobIds,
    }))
    .filter((signal) => Math.abs(signal.strength) >= 0.05)

  if (args.profile) {
    const known = new Set(signals.map((signal) => signal.key))
    for (const fact of profileFacts(args.profile)) {
      if (known.has(fact.key)) continue
      known.add(fact.key)
      signals.push({
        key: fact.key,
        aspect: fact.aspect,
        label: fact.label,
        strength: PROFILE_STRENGTH,
        likes: 0,
        dislikes: 0,
        source: "profile",
        from: [],
        likedJobIds: [],
        dislikedJobIds: [],
      })
    }
  }

  signals.sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength) || a.key.localeCompare(b.key))
  const aspects = emptyAspects()
  for (const aspect of FEEDBACK_ASPECTS) aspects[aspect] = round3(Math.tanh(aspectSums[aspect] / 2))

  return {
    userId: args.userId,
    locale: args.locale,
    builtAt: now,
    liked,
    disliked,
    aspects,
    signals,
    likedTitles: likedTitles.slice(0, 60),
    dislikedTitles: dislikedTitles.slice(0, 60),
    decided: new Set(args.rows.map((row) => row.jobId)),
  }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

export const feedbackJobSelect = {
  id: true,
  title: true,
  descriptionText: true,
  locationText: true,
  countryCode: true,
  countries: true,
  remoteRegions: true,
  workplaceType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  seniorityLevel: true,
  employmentType: true,
  company: { select: { name: true, industry: true } },
} as const

export function jobToOffer(job: {
  id: string
  title: string
  descriptionText: string
  locationText: string | null
  countryCode: string | null
  countries?: string[]
  remoteRegions?: string[]
  workplaceType: string
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
  seniorityLevel: string | null
  employmentType: string | null
  company: { name: string; industry: string | null }
}): OfferForScoring {
  return {
    id: job.id,
    title: job.title,
    description: job.descriptionText.slice(0, 12_000),
    company: job.company.name,
    companyIndustry: job.company.industry,
    locationText: job.locationText,
    countryCode: job.countryCode,
    countries: job.countries,
    remoteRegions: job.remoteRegions,
    workplaceType: job.workplaceType,
    salaryMin: job.salaryMin,
    salaryMax: job.salaryMax,
    salaryCurrency: job.salaryCurrency,
    seniorityLevel: job.seniorityLevel,
    employmentType: job.employmentType,
  }
}

async function loadRows(userId: number): Promise<FeedbackRow[]> {
  const rows = await db.offerFeedback.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: {
      jobId: true,
      verdict: true,
      aspects: true,
      tags: true,
      updatedAt: true,
      job: { select: feedbackJobSelect },
    },
  })
  return rows.flatMap((row) => {
    if (!isVerdict(row.verdict)) return []
    const stored = splitStoredTags(row.tags)
    return [
      {
        jobId: row.jobId,
        verdict: row.verdict,
        aspects: parseAspects(row.aspects),
        tags: stored.tags,
        muted: stored.muted,
        updatedAt: row.updatedAt,
        offer: jobToOffer(row.job),
      },
    ]
  })
}

export async function buildPreferenceModel(userId: number): Promise<PreferenceModel> {
  const [rows, profile, user] = await Promise.all([
    loadRows(userId),
    db.candidateProfile.findUnique({
      where: { userId },
      select: {
        skills: true,
        industries: true,
        seniority: true,
        remotePreference: true,
        homeCity: true,
        locations: true,
      },
    }),
    db.user.findUnique({ where: { id: userId }, select: { locale: true } }),
  ])
  const locale: Locale = user?.locale === "en" ? "en" : "pl"
  return modelFromRows({ userId, locale, rows, profile })
}

type Contribution = { label: Bilingual; points: number; jobs: string[]; title?: string }

function joinLabels(items: Contribution[], locale: Locale): string {
  const labels = items.map((item) =>
    item.title ? item.title : locale === "pl" ? item.label.pl : item.label.en
  )
  const seen = new Set<string>()
  return labels
    .filter((label) => {
      const key = fold(label)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(", ")
}

function sentence(items: Contribution[], positive: boolean): Bilingual {
  const jobs = new Set(items.flatMap((item) => item.jobs))
  const one = jobs.size <= 1
  const pl = positive
    ? `Podobne do ${one ? "polubionej" : "polubionych"}: ${joinLabels(items, "pl")}`
    : `Podobne do ${one ? "odrzuconej" : "odrzuconych"}: ${joinLabels(items, "pl")}`
  const en = positive
    ? `Like ${one ? "an offer" : "offers"} you liked: ${joinLabels(items, "en")}`
    : `Like ${one ? "an offer" : "offers"} you passed on: ${joinLabels(items, "en")}`
  return { pl, en }
}

function bestTitle(
  titles: TitleSignal[],
  tokens: string[],
  skipJobId?: string
): { signal: TitleSignal; dice: number } | null {
  let best: { signal: TitleSignal; dice: number } | null = null
  for (const signal of titles) {
    if (signal.jobId === skipJobId) continue
    const dice = titleSimilarity(tokens, signal.tokens)
    if (dice < TITLE_MIN_DICE) continue
    const value = dice * Math.min(1, signal.weight)
    if (!best || value > best.dice * Math.min(1, best.signal.weight)) best = { signal, dice }
  }
  return best
}

/**
 * Bounded, explained correction for one offer: delta in [-12, +12] and at most two reasons
 * ("Podobne do polubionej: Kotlin, 100% zdalnie"). Profile-only signals are left out here
 * because rankAgainstProfile already scores the profile.
 */
export function preferenceAdjustment(
  model: PreferenceModel,
  offer: OfferForScoring,
  precomputed?: OfferProfile
): PreferenceAdjustment {
  const profile = precomputed ?? profileOffer(offer)
  const text = offerText(offer)
  const contributions: Contribution[] = []
  for (const signal of model.signals) {
    if (signal.source !== "feedback") continue
    if (!offerHasKey(profile, signal.key, text)) continue
    const care = 1 + 0.5 * Math.max(0, model.aspects[signal.aspect])
    const points = signal.strength * ASPECT_POINTS[signal.aspect] * care
    if (Math.abs(points) < 0.25) continue
    contributions.push({ label: signal.label, points, jobs: signal.from.map((item) => item.jobId) })
  }
  const likedTitle = bestTitle(model.likedTitles, profile.titleTokens, offer.id)
  if (likedTitle) {
    contributions.push({
      label: { pl: likedTitle.signal.title, en: likedTitle.signal.title },
      title: likedTitle.signal.title,
      points: TITLE_POINTS * likedTitle.dice * Math.min(1, likedTitle.signal.weight),
      jobs: [likedTitle.signal.jobId],
    })
  }
  const dislikedTitle = bestTitle(model.dislikedTitles, profile.titleTokens, offer.id)
  if (dislikedTitle) {
    contributions.push({
      label: { pl: dislikedTitle.signal.title, en: dislikedTitle.signal.title },
      title: dislikedTitle.signal.title,
      points: -TITLE_POINTS * dislikedTitle.dice * Math.min(1, dislikedTitle.signal.weight),
      jobs: [dislikedTitle.signal.jobId],
    })
  }
  const raw = contributions.reduce((sum, item) => sum + item.points, 0)
  const delta = clampDelta(Math.round(DELTA_CAP * Math.tanh(raw / DELTA_CAP)))
  if (delta === 0) return { delta: 0, reasons: [], reasonsI18n: [], signs: [] }

  const plus = contributions
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3)
  const minus = contributions
    .filter((item) => item.points < 0)
    .sort((a, b) => a.points - b.points)
    .slice(0, 3)
  const ordered = delta > 0 ? [plus, minus] : [minus, plus]
  const reasonsI18n: Bilingual[] = []
  const signs: (1 | -1)[] = []
  for (const group of ordered) {
    if (!group.length) continue
    const positive = group[0].points > 0
    reasonsI18n.push(sentence(group, positive))
    signs.push(positive ? 1 : -1)
  }
  return {
    delta,
    reasonsI18n,
    signs,
    reasons: reasonsI18n.map((item) => (model.locale === "en" ? item.en : item.pl)),
  }
}

export function clampDelta(value: number): number {
  if (!Number.isFinite(value)) return 0
  const clamped = Math.max(-DELTA_CAP, Math.min(DELTA_CAP, Math.round(value)))
  return clamped === 0 ? 0 : clamped
}

export type PreferenceSummary = {
  liked: number
  disliked: number
  /** Every learned tag, strongest first: positives (sign 1) then negatives (sign -1), then profile. */
  taste: TasteItem[]
  /** Shortcuts into `taste` for the two columns of "Twój gust". */
  likes: TasteItem[]
  dislikes: TasteItem[]
  /** Keys the person muted, so the UI can offer "undo". */
  muted: string[]
  /** "Lubisz: 100% zdalnie, Kotlin, fintech" / "You like: ..." or null when nothing is learned yet. */
  text: string | null
  textI18n: Bilingual | null
  topAspects: FeedbackAspect[]
}

export const TASTE_MIN_STRENGTH = 0.15

export function tasteItem(signal: PreferenceSignal, locale: Locale): TasteItem {
  const sign: 1 | -1 = signal.strength < 0 ? -1 : 1
  const jobIds = sign > 0 ? signal.likedJobIds : signal.dislikedJobIds
  return {
    key: signal.key,
    aspect: signal.aspect,
    tag: locale === "en" ? signal.label.en : signal.label.pl,
    tagI18n: signal.label,
    sign,
    count: jobIds.length,
    jobIds,
    strength: signal.strength,
    source: signal.source,
    removable: signal.source === "feedback",
  }
}

/** The "You like: remote, Kotlin, fintech" summary. Profile signals fill in only after feedback ones. */
export function summarizeModel(
  model: PreferenceModel,
  locale: Locale = model.locale,
  muted: string[] = []
): PreferenceSummary {
  const feedback = model.signals.filter((signal) => signal.source === "feedback")
  const likes = feedback.filter((signal) => signal.strength >= TASTE_MIN_STRENGTH)
  const dislikes = feedback.filter((signal) => signal.strength <= -TASTE_MIN_STRENGTH)
  const profile = model.signals.filter((signal) => signal.source === "profile")
  const likeItems = [...likes.slice(0, 12), ...profile.slice(0, Math.max(0, 6 - likes.length))].map(
    (signal) => tasteItem(signal, locale)
  )
  const dislikeItems = dislikes.slice(0, 8).map((signal) => tasteItem(signal, locale))
  const head = likes.slice(0, 4)
  const textI18n = head.length
    ? {
        pl: `Lubisz: ${head.map((signal) => signal.label.pl).join(", ")}`,
        en: `You like: ${head.map((signal) => signal.label.en).join(", ")}`,
      }
    : null
  const topAspects = FEEDBACK_ASPECTS.filter((aspect) => model.aspects[aspect] >= 0.2).sort(
    (a, b) => model.aspects[b] - model.aspects[a]
  )
  return {
    liked: model.liked,
    disliked: model.disliked,
    taste: [...likeItems, ...dislikeItems],
    likes: likeItems,
    dislikes: dislikeItems,
    muted,
    text: textI18n ? (locale === "en" ? textI18n.en : textI18n.pl) : null,
    textI18n,
    topAspects,
  }
}

/**
 * Stops the model learning one fact key (e.g. "skill:kotlin") from every offer that taught it,
 * by adding a muted marker to those feedback rows. The verdicts and picked chips stay.
 */
export async function dropSignal(userId: number, key: string): Promise<{ updated: number }> {
  const target = key.trim().slice(0, 120)
  if (!target) return { updated: 0 }
  const rows = await db.offerFeedback.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_ROWS,
    select: { id: true, aspects: true, tags: true, job: { select: feedbackJobSelect } },
  })
  let updated = 0
  for (const row of rows) {
    const stored = splitStoredTags(row.tags)
    if (stored.muted.includes(target)) continue
    const offer = profileOffer(jobToOffer(row.job))
    const contributes = rowContributions(
      { aspects: parseAspects(row.aspects), tags: stored.tags, muted: stored.muted },
      offer
    ).some((item) => item.fact.key === target)
    if (!contributes) continue
    await db.offerFeedback.update({
      where: { id: row.id },
      data: { tags: storedTags(stored.tags, [...stored.muted, target]) },
    })
    updated += 1
  }
  return { updated }
}

/** Undo for dropSignal: the key is learned again from every offer that muted it. */
export async function restoreSignal(userId: number, key: string): Promise<{ updated: number }> {
  const target = key.trim().slice(0, 120)
  if (!target) return { updated: 0 }
  const rows = await db.offerFeedback.findMany({
    where: { userId },
    select: { id: true, tags: true },
  })
  let updated = 0
  for (const row of rows) {
    const stored = splitStoredTags(row.tags)
    if (!stored.muted.includes(target)) continue
    await db.offerFeedback.update({
      where: { id: row.id },
      data: {
        tags: storedTags(
          stored.tags,
          stored.muted.filter((item) => item !== target)
        ),
      },
    })
    updated += 1
  }
  return { updated }
}

/** Muted keys across all of a person's feedback. */
export async function listMutedSignals(userId: number): Promise<string[]> {
  const rows = await db.offerFeedback.findMany({ where: { userId }, select: { tags: true } })
  return [...new Set(rows.flatMap((row) => splitStoredTags(row.tags).muted))].sort()
}

export async function getPreferenceSummary(
  userId: number,
  locale?: Locale
): Promise<PreferenceSummary> {
  const [model, muted] = await Promise.all([buildPreferenceModel(userId), listMutedSignals(userId)])
  return summarizeModel(model, locale ?? model.locale, muted)
}
