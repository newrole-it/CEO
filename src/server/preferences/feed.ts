/**
 * One score for the For-you feed and the offer drawer, so both always agree:
 * score = parts (title, seniority, location, salary, freshness, source; max 100)
 *       + industry delta + skill delta (from rankAgainstProfile) + preference delta (±12).
 */
import { DEFAULT_CONFIG } from "@newrole/matching/config"
import { industryFromRules } from "@newrole/profile/industry"
import { rankAgainstProfile, type ProfileSignals } from "src/server/profile/rank"
import {
  clampScore,
  feedBreakdown,
  type BreakdownProfile,
  type ScorePart,
  type SourceKind,
} from "./breakdown"
import { profileOffer, type OfferProfile } from "./facts"
import { preferenceAdjustment } from "./model"
import type { Locale, OfferForScoring, PreferenceAdjustment, PreferenceModel } from "./types"

export type ReasonOrigin = "profile" | "feedback"

export type FeedReason = {
  text: string
  kind: "ok" | "warn"
  origin: ReasonOrigin
}

export type FeedScore = {
  score: number
  base: number
  parts: ScorePart[]
  industryDelta: number
  skillDelta: number
  industry: string | null
  preference: PreferenceAdjustment
  reasons: FeedReason[]
}

const NO_PREFERENCE: PreferenceAdjustment = { delta: 0, reasons: [], reasonsI18n: [], signs: [] }

export function scoreForFeed(args: {
  offer: OfferForScoring
  facts?: OfferProfile
  signals: ProfileSignals | null
  profile: BreakdownProfile | null
  model: PreferenceModel | null
  firstSeenAt: Date | null
  publishedAt: Date | null
  sourceKind: SourceKind
  provider: string | null
  locale: Locale
  now?: Date
}): FeedScore {
  const facts = args.facts ?? profileOffer(args.offer)
  const breakdown = feedBreakdown({
    offer: facts,
    profile: args.profile,
    firstSeenAt: args.firstSeenAt,
    publishedAt: args.publishedAt,
    sourceKind: args.sourceKind,
    provider: args.provider,
    now: args.now,
  })
  const description = (args.offer.description ?? "").slice(0, 8000)
  const fit = args.signals
    ? rankAgainstProfile({
        queryScore: 50,
        signals: { ...args.signals, locale: args.locale },
        config: DEFAULT_CONFIG,
        title: args.offer.title,
        description,
        location: args.offer.locationText ?? "",
        workplace: args.offer.workplaceType ?? "",
        salary: facts.monthly,
        jobIndustry: industryFromRules(args.offer.title, description),
        seniority: args.offer.seniorityLevel ?? null,
      })
    : null
  const preference = args.model
    ? preferenceAdjustment(args.model, args.offer, facts)
    : NO_PREFERENCE
  const industryDelta = fit?.industryDelta ?? 0
  const skillDelta = fit?.skillDelta ?? 0
  const reasons: FeedReason[] = [
    // the page's language, not the account's: User.locale defaults to "en" for a Polish page
    ...preference.reasonsI18n.map((text, index) => ({
      text: args.locale === "en" ? text.en : text.pl,
      kind: (preference.signs[index] < 0 ? "warn" : "ok") as FeedReason["kind"],
      origin: "feedback" as const,
    })),
    ...(fit?.lines ?? []).map((line) => ({
      text: line.text,
      kind: line.kind,
      origin: "profile" as const,
    })),
  ]
  return {
    score: clampScore(breakdown.base + industryDelta + skillDelta + preference.delta),
    base: breakdown.base,
    parts: breakdown.parts,
    industryDelta,
    skillDelta,
    industry: fit?.industry ?? facts.industry,
    preference,
    reasons,
  }
}
