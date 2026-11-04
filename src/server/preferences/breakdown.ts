/**
 * Where an offer comes from, and the "why this score" drawer for the For-you feed.
 * The parts use the same ids and maxima as packages/matching/scoring.ts (title 30, seniority 15,
 * location 25, salary 15, freshness 10, source 5), measured against the profile instead of a
 * saved search. The feed score is exactly: parts + industry + skills + preference delta.
 */
import { DEFAULT_CONFIG } from "@newrole/matching/config"
import { functionTokens, normalizeTitle } from "@newrole/matching/normalization"
import { fold } from "@newrole/matching/text"
import { SENIORITY_RANK, type Seniority } from "@newrole/matching/types"
import { NEW_ATS_LABELS } from "src/shared/ats-labels"
import { canonicalCity } from "src/server/jobs/offer-facts"
import { profileMonthlyPln, type ProfilePay } from "src/server/profile/salary"
import { asStringList } from "@newrole/profile/schema"
import { roleLabel, titleSimilarity, type OfferProfile } from "./facts"
import type { Bilingual } from "./types"

export type SourceKind = "company-site" | "ats" | "link-only" | "mcp"

const PROVIDER_LABEL: Record<string, string> = {
  GREENHOUSE: "Greenhouse",
  LEVER: "Lever",
  ASHBY: "Ashby",
  WORKABLE: "Workable",
  SMARTRECRUITERS: "SmartRecruiters",
  TRAFFIT: "Traffit",
  RECRUITEE: "Recruitee",
  TEAMTAILOR: "Teamtailor",
  PERSONIO: "Personio",
  PINPOINT: "Pinpoint",
  BREEZY: "Breezy HR",
  BAMBOOHR: "BambooHR",
  SUCCESSFACTORS: "SuccessFactors",
  WORKDAY: "Workday",
  ICIMS: "iCIMS",
  PHENOM: "Phenom",
  AVATURE: "Avature",
  ERECRUITER: "eRecruiter",
  JOBVITE: "Jobvite",
  ...NEW_ATS_LABELS,
}

/**
 * ATS boards → "ats" with the ATS name. Career-site and generic HTML pages → "company-site".
 * WEB_SEARCH rows added through MCP (board id "mcp:…") → "mcp"; other WEB_SEARCH rows
 * without a description are links we may not read → "link-only".
 */
export function sourceOf(job: {
  sourceType: string
  sourceBoardId: string | null
  hasDescription: boolean
}): { sourceKind: SourceKind; provider: string | null } {
  if (job.sourceType === "WEB_SEARCH") {
    if (job.sourceBoardId?.startsWith("mcp:")) return { sourceKind: "mcp", provider: "Claude" }
    return { sourceKind: job.hasDescription ? "company-site" : "link-only", provider: null }
  }
  if (job.sourceType === "CAREER_SITE" || job.sourceType === "GENERIC_HTML") {
    return { sourceKind: "company-site", provider: null }
  }
  return { sourceKind: "ats", provider: PROVIDER_LABEL[job.sourceType] ?? job.sourceType }
}

export type PartId = "title" | "seniority" | "location" | "salary" | "freshness" | "source"

export const PART_MAX: Record<PartId, number> = {
  title: 30,
  seniority: 15,
  location: 25,
  salary: 15,
  freshness: 10,
  source: 5,
}

export type ScorePart = {
  id: PartId
  max: number
  /** 0..1 */
  value: number
  points: number
  reason: Bilingual
}

export type BreakdownProfile = ProfilePay & {
  currentTitle: string | null
  pastTitles: unknown
  seniority: string | null
  remotePreference: string | null
  homeCity: string | null
  locations: unknown
}

function part(id: PartId, value: number, reason: Bilingual): ScorePart {
  const clamped = Math.max(0, Math.min(1, value))
  return {
    id,
    max: PART_MAX[id],
    value: Math.round(clamped * 100) / 100,
    points: Math.round(PART_MAX[id] * clamped * 10) / 10,
    reason,
  }
}

function titlePart(offer: OfferProfile, profile: BreakdownProfile | null): ScorePart {
  const titles = profile
    ? [profile.currentTitle, ...asStringList(profile.pastTitles)].filter((title): title is string =>
        Boolean(title?.trim())
      )
    : []
  if (!titles.length) {
    return part("title", 0.5, { pl: "Brak stanowiska w profilu", en: "No title in your profile" })
  }
  let best = 0
  let bestTitle = titles[0]
  for (const title of titles) {
    const value = titleSimilarity(
      functionTokens(normalizeTitle(roleLabel(title))),
      offer.titleTokens
    )
    if (value > best) {
      best = value
      bestTitle = title
    }
  }
  if (best >= 0.5) {
    return part("title", Math.min(1, 0.4 + best * 0.6), {
      pl: `Podobne do: ${bestTitle}`,
      en: `Close to: ${bestTitle}`,
    })
  }
  return part("title", best * 0.8, {
    pl: "Inne stanowisko niż w profilu",
    en: "A different role from your profile",
  })
}

function seniorityPart(offer: OfferProfile, profile: BreakdownProfile | null): ScorePart {
  const mine = profile?.seniority
  if (!mine || !(mine in SENIORITY_RANK) || !offer.seniority) {
    return part("seniority", 0.5, { pl: "Poziom nieznany", en: "Level unknown" })
  }
  const gap = Math.abs(SENIORITY_RANK[offer.seniority] - SENIORITY_RANK[mine as Seniority])
  if (gap === 0) return part("seniority", 1, { pl: "Ten sam poziom", en: "Same level" })
  if (gap === 1) return part("seniority", 0.6, { pl: "Poziom obok", en: "One level apart" })
  if (gap === 2)
    return part("seniority", 0.3, { pl: "Dwa poziomy różnicy", en: "Two levels apart" })
  return part("seniority", 0, { pl: "Inny poziom", en: "Different level" })
}

function locationPart(offer: OfferProfile, profile: BreakdownProfile | null): ScorePart {
  const pref = profile?.remotePreference ?? null
  const cities = profile
    ? [profile.homeCity, ...asStringList(profile.locations)]
        .filter((city): city is string => Boolean(city?.trim()))
        .map((city) => fold(canonicalCity(city) ?? city.trim()))
    : []
  const inCity = Boolean(offer.city && cities.includes(fold(offer.city)))
  if (offer.workMode === "remote") {
    return part("location", pref === "onsite" ? 0.6 : 1, { pl: "Zdalnie", en: "Remote" })
  }
  if (inCity) {
    return part("location", 1, {
      pl: `W Twoim mieście: ${offer.city}`,
      en: `In your city: ${offer.city}`,
    })
  }
  if (offer.workMode === "unknown" && !offer.city) {
    return part("location", 0.5, { pl: "Lokalizacja nieznana", en: "Location unknown" })
  }
  if (pref === "remote") {
    return part("location", 0.2, {
      pl: "Wymaga biura, a wolisz zdalnie",
      en: "Needs an office; you prefer remote",
    })
  }
  if (!cities.length) {
    return part("location", 0.6, { pl: "Brak miasta w profilu", en: "No city in your profile" })
  }
  return part("location", 0.3, {
    pl: offer.city ? `Inne miasto: ${offer.city}` : "Inne miasto",
    en: offer.city ? `Another city: ${offer.city}` : "Another city",
  })
}

function salaryPart(offer: OfferProfile, profile: BreakdownProfile | null): ScorePart {
  if (!offer.monthly) {
    return part("salary", 0.3, { pl: "Widełki nie podane", en: "Pay not listed" })
  }
  const floor = profile ? profileMonthlyPln(profile, DEFAULT_CONFIG).floor : null
  if (floor == null) {
    return part("salary", 0.7, { pl: "Widełki podane", en: "Pay listed" })
  }
  if (offer.monthly.max >= floor) {
    return part("salary", 1, { pl: "Powyżej Twojego minimum", en: "Above your minimum" })
  }
  return part("salary", Math.max(0, offer.monthly.max / floor - 0.3), {
    pl: "Poniżej Twojego minimum",
    en: "Below your minimum",
  })
}

export function freshnessValue(days: number): number {
  if (days <= 3) return 1
  if (days <= 7) return 0.85
  if (days <= 14) return 0.7
  if (days <= 30) return 0.4
  if (days <= 60) return 0.15
  return 0
}

/** Taken off the base when the offer's own posting date is more than a year old. */
export const STALE_POSTING_PENALTY = 10

function freshnessPart(seenAt: Date | null, now: Date): ScorePart {
  if (!seenAt) return part("freshness", 0.3, { pl: "Data nieznana", en: "Date unknown" })
  const days = Math.max(0, Math.floor((now.getTime() - seenAt.getTime()) / 86_400_000))
  if (days > 365) {
    return part("freshness", 0, {
      pl: `Opublikowana ${days} dni temu, ponad rok (−${STALE_POSTING_PENALTY} pkt)`,
      en: `Posted ${days} days ago, over a year (−${STALE_POSTING_PENALTY} pts)`,
    })
  }
  return part("freshness", freshnessValue(days), {
    pl: days === 0 ? "Nowa dzisiaj" : `Widziana pierwszy raz ${days} dni temu`,
    en: days === 0 ? "New today" : `First seen ${days} days ago`,
  })
}

function sourcePart(kind: SourceKind, provider: string | null): ScorePart {
  if (kind === "ats") {
    return part("source", 1, {
      pl: `Prosto z systemu rekrutacji${provider ? ` (${provider})` : ""}`,
      en: `Straight from the ATS${provider ? ` (${provider})` : ""}`,
    })
  }
  if (kind === "company-site") return part("source", 1, { pl: "Strona firmy", en: "Company site" })
  if (kind === "mcp")
    return part("source", 0.85, { pl: "Dodana przez Claude", en: "Added by Claude" })
  return part("source", 0.5, { pl: "Tylko link", en: "Link only" })
}

export function feedBreakdown(args: {
  offer: OfferProfile
  profile: BreakdownProfile | null
  firstSeenAt: Date | null
  publishedAt: Date | null
  sourceKind: SourceKind
  provider: string | null
  now?: Date
}): { parts: ScorePart[]; base: number } {
  const now = args.now ?? new Date()
  const seen =
    args.publishedAt && args.firstSeenAt
      ? new Date(Math.min(args.publishedAt.getTime(), args.firstSeenAt.getTime()))
      : args.publishedAt ?? args.firstSeenAt
  const parts = [
    titlePart(args.offer, args.profile),
    seniorityPart(args.offer, args.profile),
    locationPart(args.offer, args.profile),
    salaryPart(args.offer, args.profile),
    freshnessPart(seen, now),
    sourcePart(args.sourceKind, args.provider),
  ]
  const stale =
    args.publishedAt != null && now.getTime() - args.publishedAt.getTime() > 365 * 86_400_000
  const base = Math.round(
    parts.reduce((sum, item) => sum + item.points, 0) - (stale ? STALE_POSTING_PENALTY : 0)
  )
  return { parts, base }
}

export function clampScore(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)))
}
