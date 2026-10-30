/**
 * "Co Ci się podoba?" / "Dlaczego nie?": chips per aspect, filled with concrete tags from the
 * offer. Aspects that already match the person's profile (or their saved answer) start selected.
 */
import db from "db"
import { DEFAULT_CONFIG } from "matching/config"
import { functionTokens, normalizeTitle } from "matching/normalization"
import { diceTokens, fold } from "matching/text"
import { canonicalCity } from "src/server/jobs/offer-facts"
import { industryRelation } from "src/server/profile/industry"
import { profileMonthlyPln } from "src/server/profile/salary"
import { asStringList } from "src/server/profile/schema"
import { FEEDBACK_ASPECTS, type FeedbackAspect } from "src/shared/feedback-aspects"
import { getFeedback } from "./feedback"
import { profileOffer, skillId, type OfferProfile } from "./facts"
import { feedbackJobSelect, jobToOffer } from "./model"
import type { FeedbackPrompt, Locale, PromptSuggestion } from "./types"

export type PromptProfile = {
  currentTitle: string | null
  pastTitles: unknown
  skills: unknown
  industries: unknown
  seniority: string | null
  remotePreference: string | null
  homeCity: string | null
  locations: unknown
  salaryFloor: number | null
  salaryTarget: number | null
  salaryCurrency: string | null
  salaryPeriod: string | null
  salaryContract: string | null
  contracts: unknown
}

const MAX_TAGS_PER_ASPECT = 6

/** Aspects where the offer agrees with the profile. */
export function profileMatches(
  offer: OfferProfile,
  profile: PromptProfile | null
): Set<FeedbackAspect> {
  const out = new Set<FeedbackAspect>()
  if (!profile) return out
  const skills = new Set(
    asStringList(profile.skills).flatMap((skill) => {
      const id = skillId(skill)
      return id ? [id] : []
    })
  )
  if (offer.skills.some((id) => skills.has(id))) out.add("stack")
  if (profile.remotePreference && profile.remotePreference === offer.workMode) out.add("remote")
  const cities = [profile.homeCity, ...asStringList(profile.locations)]
    .filter((city): city is string => Boolean(city?.trim()))
    .map((city) => fold(canonicalCity(city) ?? city.trim()))
  if (offer.city && cities.includes(fold(offer.city))) out.add("location")
  const relation = industryRelation(offer.industry, asStringList(profile.industries))
  if (relation === "same" || relation === "adjacent") out.add("industry")
  if (profile.seniority && profile.seniority === offer.seniority) out.add("seniority")
  if (offer.monthly) {
    const monthly = profileMonthlyPln(
      {
        salaryFloor: profile.salaryFloor,
        salaryTarget: profile.salaryTarget,
        salaryCurrency: profile.salaryCurrency,
        salaryPeriod: profile.salaryPeriod,
        salaryContract: profile.salaryContract,
      },
      DEFAULT_CONFIG
    )
    if (monthly.floor != null && offer.monthly.max >= monthly.floor) out.add("salary")
  }
  const contracts = new Set(
    [profile.salaryContract, ...asStringList(profile.contracts)]
      .filter((item): item is string => Boolean(item))
      .map((item) => fold(item).trim())
  )
  if (offer.contracts.some((id) => contracts.has(id))) out.add("contract")
  const titles = [profile.currentTitle, ...asStringList(profile.pastTitles)].filter(
    (title): title is string => Boolean(title?.trim())
  )
  if (
    offer.titleTokens.length &&
    titles.some(
      (title) => diceTokens(functionTokens(normalizeTitle(title)), offer.titleTokens) >= 0.5
    )
  ) {
    out.add("role")
  }
  return out
}

/** One entry per aspect, in FEEDBACK_ASPECTS order, with the offer's tags in the given locale. */
export function buildSuggestions(
  offer: OfferProfile,
  locale: Locale,
  preselect: Set<FeedbackAspect>
): PromptSuggestion[] {
  return FEEDBACK_ASPECTS.map((aspect) => {
    const tags = offer.facts
      .filter((fact) => fact.aspect === aspect)
      .map((fact) => (locale === "en" ? fact.label.en : fact.label.pl))
      .slice(0, MAX_TAGS_PER_ASPECT)
    return { aspect, tags, preselected: preselect.has(aspect) }
  })
}

export async function feedbackPrompt(
  jobId: string,
  userId?: number,
  opts: { locale?: Locale } = {}
): Promise<FeedbackPrompt> {
  const [job, profile, user, existing] = await Promise.all([
    db.job.findUnique({ where: { id: jobId }, select: feedbackJobSelect }),
    userId
      ? db.candidateProfile.findUnique({
          where: { userId },
          select: {
            currentTitle: true,
            pastTitles: true,
            skills: true,
            industries: true,
            seniority: true,
            remotePreference: true,
            homeCity: true,
            locations: true,
            salaryFloor: true,
            salaryTarget: true,
            salaryCurrency: true,
            salaryPeriod: true,
            salaryContract: true,
            contracts: true,
          },
        })
      : null,
    userId && !opts.locale
      ? db.user.findUnique({ where: { id: userId }, select: { locale: true } })
      : null,
    userId ? getFeedback(userId, jobId) : null,
  ])
  if (!job) return { jobId, suggestions: [], existing: null }
  const locale: Locale = opts.locale ?? (user?.locale === "en" ? "en" : "pl")
  const offer = profileOffer(jobToOffer(job))
  const preselect = existing?.aspects.length
    ? new Set(existing.aspects)
    : profileMatches(offer, profile)
  return { jobId, suggestions: buildSuggestions(offer, locale, preselect), existing }
}
