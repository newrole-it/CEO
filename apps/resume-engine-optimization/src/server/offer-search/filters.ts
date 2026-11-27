import type { CandidateProfile } from "@prisma/client"
import type { z } from "zod"
import type { EvaluationFacts } from "@newrole/cv-core/evaluation"
import {
  asStringList,
  profileDraftSchema,
  salaryCurrencies,
  seniorityValues,
} from "@newrole/profile/schema"
import { FILTER_ITEM_MAX, filtersDiffer, PAY_MAX, SearchFilters } from "src/shared/offer-search"

export { SearchFilters }

const MAX_ROLES = 3
const MAX_SKILLS = 8
const WORK_MODES = ["remote", "hybrid", "onsite", "any"] as const
const INDUSTRY_MODES = ["stick", "prefer", "any"] as const

/**
 * Trimmed, empty ones and ones longer than a filter item dropped, duplicates ignoring case dropped
 * (the first spelling stays).
 */
function unique(list: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const fits = (item: string) => item.length > 0 && item.length <= FILTER_ITEM_MAX
  for (const item of list.map((value) => value.trim()).filter(fits)) {
    const key = item.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

function oneOf<T extends string>(values: readonly T[], value: unknown): T | null {
  return values.find((candidate) => candidate === value) ?? null
}

export function filtersFromProfile(profile: CandidateProfile | null): SearchFilters {
  if (!profile) {
    return {
      roles: [],
      level: null,
      skills: [],
      excluded: [],
      places: [],
      relocation: false,
      workMode: "any",
      minPay: { amount: null, currency: null, period: "month", contract: null },
      contracts: [],
      industries: [],
      industryMode: "prefer",
      languages: [],
      freshnessDays: 30,
    }
  }
  // a title is cut to fit rather than dropped (a place or a skill cut short would be another one)
  const titles = [profile.currentTitle ?? "", ...asStringList(profile.pastTitles)].map((title) =>
    title.trim().slice(0, FILTER_ITEM_MAX)
  )
  const floor = profile.salaryFloor
  return {
    roles: unique(titles).slice(0, MAX_ROLES),
    level: oneOf(seniorityValues, profile.seniority),
    skills: unique(asStringList(profile.skills)).slice(0, MAX_SKILLS),
    excluded: [],
    places: unique([profile.homeCity ?? "", ...asStringList(profile.locations)]).slice(0, 6),
    relocation: profile.relocation === true,
    workMode: oneOf(WORK_MODES, profile.remotePreference) ?? "any",
    minPay: {
      amount: floor != null && floor >= 0 && floor <= PAY_MAX ? floor : null,
      currency: oneOf(salaryCurrencies, profile.salaryCurrency?.trim()),
      period: oneOf(["month", "year"] as const, profile.salaryPeriod) ?? "month",
      contract: oneOf(["uop", "b2b"] as const, profile.salaryContract),
    },
    contracts: unique(asStringList(profile.contracts)).slice(0, 6),
    industries: unique(asStringList(profile.industries)).slice(0, 6),
    industryMode: oneOf(INDUSTRY_MODES, profile.industryMode) ?? "prefer",
    languages: unique(asStringList(profile.languages)).slice(0, 4),
    freshnessDays: 30,
  }
}

export function personFromFilters(
  filters: SearchFilters,
  salaryTarget: number | null
): EvaluationFacts["person"] {
  return {
    seniority: filters.level,
    salaryFloor: filters.minPay.amount,
    salaryTarget,
    salaryCurrency: filters.minPay.currency,
    salaryPeriod: filters.minPay.period,
    salaryContract: filters.minPay.contract,
    remotePreference: filters.workMode,
    homeCity: filters.places[0] ?? null,
    locations: filters.places.slice(1),
    relocation: filters.relocation,
  }
}

/** True when the filters differ from what the profile would propose in the fields "save to my profile" writes. */
export function profileDiff(filters: SearchFilters, profile: CandidateProfile | null): boolean {
  return filtersDiffer(filters, filtersFromProfile(profile))
}

/** The profile's own rules for the fields "Also save to my profile" writes. */
const patchSchema = profileDraftSchema.pick({
  seniority: true,
  salaryFloor: true,
  salaryCurrency: true,
  salaryPeriod: true,
  salaryContract: true,
  remotePreference: true,
  homeCity: true,
  locations: true,
  relocation: true,
})
export type ProfilePatch = z.infer<typeof patchSchema>

/**
 * The profile fields "Also save to my profile" writes, checked against the profile's own schema
 * (a ZodError when they break it), so the search form cannot write what the profile form refuses.
 */
export function profilePatch(filters: SearchFilters): ProfilePatch {
  return patchSchema.parse({
    seniority: filters.level,
    salaryFloor: filters.minPay.amount,
    salaryCurrency: filters.minPay.currency,
    salaryPeriod: filters.minPay.period,
    salaryContract: filters.minPay.contract,
    remotePreference: filters.workMode,
    homeCity: filters.places[0] ?? null,
    locations: filters.places.slice(1),
    relocation: filters.relocation,
  })
}
