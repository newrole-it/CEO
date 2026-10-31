import type { MatchingConfig } from "matching/config"
import { detectSeniority } from "matching/normalization"
import { fold } from "matching/text"
import { SENIORITY_RANK, type Seniority } from "matching/types"
import {
  explainCity,
  explainIndustry,
  explainIndustryLine,
  explainSalary,
  explainSalaryLine,
  explainSeniority,
  explainSeniorityGap,
  explainSkills,
  explainWorkplace,
  pickFitLines,
  whyItMatches,
  type FitLine,
} from "./explain"
import {
  industryDelta,
  industryRelation,
  type DomainRequirement,
  type JobIndustry,
} from "./industry"
import { profileMonthlyPln, scoreSalary, type MonthlyRange, type ProfilePay } from "./salary"
import { asStringList, type IndustryMode } from "./schema"
import { skillOverlap } from "./skills"

const LEADERSHIP = new Set(["head", "director", "vp", "c_level", "senior_manager"])

export type ProfileSignals = ProfilePay & {
  skills: string[]
  industries: string[]
  seniority: string | null
  locations: string[]
  remotePreference: string | null
  homeCity: string | null
  industryMode: IndustryMode
  locale: "en" | "pl"
}

export type ProfileFit = {
  score: number
  include: true
  salaryDelta: number
  industryDelta: number
  skillDelta: number
  seniorityDelta: number
  locationDelta: number
  disclosed: boolean
  monthlyMin: number | null
  monthlyMax: number | null
  salaryMonthly: number | null
  industry: string | null
  requirement: DomainRequirement
  relation: string
  why: string
  queryScore: number
  lines: FitLine[]
}

export function toSignals(
  profile: {
    skills: unknown
    industries: unknown
    seniority: string | null
    locations: unknown
    remotePreference: string | null
    homeCity: string | null
    salaryFloor: number | null
    salaryTarget: number | null
    salaryCurrency: string | null
    salaryPeriod: string | null
    salaryContract: string | null
    industryMode: string
  },
  locale: string | null | undefined
): ProfileSignals {
  const mode: IndustryMode =
    profile.industryMode === "stick" || profile.industryMode === "any"
      ? profile.industryMode
      : "prefer"
  return {
    skills: asStringList(profile.skills),
    industries: asStringList(profile.industries),
    seniority: profile.seniority,
    locations: asStringList(profile.locations),
    remotePreference: profile.remotePreference,
    homeCity: profile.homeCity,
    salaryFloor: profile.salaryFloor,
    salaryTarget: profile.salaryTarget,
    salaryCurrency: profile.salaryCurrency,
    salaryPeriod: profile.salaryPeriod,
    salaryContract: profile.salaryContract,
    industryMode: mode,
    locale: locale === "pl" ? "pl" : "en",
  }
}

function jobSeniority(title: string, known: string | null): Seniority | null {
  if (known && known in SENIORITY_RANK) return known as Seniority
  return detectSeniority(fold(title))
}

function seniorityDelta(
  profileSeniority: string | null,
  job: Seniority | null
): { delta: number; direction: "same" | "lower" | "higher" | "near" | null } {
  if (!profileSeniority || !job || !(profileSeniority in SENIORITY_RANK))
    return { delta: 0, direction: null }
  if (job === profileSeniority) return { delta: 4, direction: "same" }
  if (LEADERSHIP.has(job) && LEADERSHIP.has(profileSeniority))
    return { delta: 3, direction: "near" }
  const distance = SENIORITY_RANK[job] - SENIORITY_RANK[profileSeniority as Seniority]
  if (distance < 0) return { delta: 0, direction: "lower" }
  if (distance > 0) return { delta: 0, direction: "higher" }
  return { delta: 0, direction: null }
}

function workplaceKind(workplace: string): "remote" | "hybrid" | "onsite" | null {
  const value = fold(workplace)
  if (/\bremote\b/.test(value)) return "remote"
  if (value.includes("hybrid")) return "hybrid"
  if (value.includes("onsite") || value.includes("on-site") || value.includes("office"))
    return "onsite"
  return null
}

function locationDelta(
  signals: ProfileSignals,
  location: string,
  workplace: string
): { delta: number; city: string | null; workplace: "remote" | "hybrid" | "onsite" | null } {
  let delta = 0
  const place = fold(`${location} ${workplace}`)
  const mode = workplaceKind(workplace)
  if (signals.remotePreference === "remote" && mode === "remote") delta += 3
  const cities = [signals.homeCity, ...signals.locations].filter((city): city is string =>
    Boolean(city?.trim())
  )
  const city = cities.find((item) => place.includes(fold(item))) ?? null
  if (city) delta += 3
  return { delta: Math.min(4, delta), city, workplace: mode }
}

export function clampScore(value: number): number {
  return Math.max(1, Math.min(100, Math.round(value)))
}

export function bandFor(score: number): "strong" | "good" | "weak" | "poor" {
  if (score >= 80) return "strong"
  if (score >= 60) return "good"
  if (score >= 40) return "weak"
  return "poor"
}

/** Profile layer on top of a query score that already cleared the relevance floor. Never hides an offer. */
export function rankAgainstProfile(args: {
  queryScore: number
  signals: ProfileSignals
  config: MatchingConfig
  title: string
  description: string
  location: string
  workplace: string
  salary: MonthlyRange | null
  jobIndustry: JobIndustry
  seniority?: string | null
}): ProfileFit {
  const monthly = profileMonthlyPln(args.signals, args.config)
  const salary = scoreSalary({
    offer: args.salary,
    floor: monthly.floor,
    target: monthly.target,
  })
  const relation = industryRelation(args.jobIndustry.industry, args.signals.industries)
  const industry = industryDelta(
    relation,
    args.jobIndustry.domainExperience,
    args.signals.industryMode
  )
  const skills = skillOverlap(args.signals.skills, args.title, args.description)
  const jobLevel = jobSeniority(args.title, args.seniority ?? null)
  const seniority = seniorityDelta(args.signals.seniority, jobLevel)
  const location = locationDelta(args.signals, args.location, args.workplace)
  const industryLine = explainIndustry({
    locale: args.signals.locale,
    industry: args.jobIndustry.industry,
    requirement: args.jobIndustry.domainExperience,
    terms: args.jobIndustry.domainTerms,
    relation,
    userIndustries: args.signals.industries,
  })
  const salaryLine = explainSalary({
    locale: args.signals.locale,
    kind: salary.kind,
    monthlyMin: salary.monthlyMin,
    monthlyMax: salary.monthlyMax,
    floor: monthly.floor,
    target: monthly.target,
  })
  const midpoint =
    salary.monthlyMin != null || salary.monthlyMax != null
      ? Math.round(
          ((salary.monthlyMin ?? salary.monthlyMax)! + (salary.monthlyMax ?? salary.monthlyMin)!) /
            2
        )
      : null
  return {
    score: clampScore(
      args.queryScore + salary.delta + industry + skills.delta + seniority.delta + location.delta
    ),
    include: true,
    salaryDelta: salary.delta,
    industryDelta: industry,
    skillDelta: skills.delta,
    seniorityDelta: seniority.delta,
    locationDelta: location.delta,
    disclosed: salary.disclosed,
    monthlyMin: salary.monthlyMin,
    monthlyMax: salary.monthlyMax,
    salaryMonthly: midpoint,
    industry: args.jobIndustry.industry,
    requirement: args.jobIndustry.domainExperience,
    relation,
    why: whyItMatches(industryLine, salaryLine),
    queryScore: args.queryScore,
    lines: pickFitLines([
      ...explainSkills(args.signals.locale, skills.hits, skills.missingRequired),
      ...[
        explainIndustryLine({
          locale: args.signals.locale,
          industry: args.jobIndustry.industry,
          relation,
          userIndustries: args.signals.industries,
        }),
      ].flatMap((line) => (line ? [line] : [])),
      ...[
        explainSalaryLine({
          locale: args.signals.locale,
          kind: salary.kind,
          floor: monthly.floor,
        }),
      ].flatMap((line) => (line ? [line] : [])),
      ...[
        seniority.direction === "lower" || seniority.direction === "higher"
          ? explainSeniorityGap(args.signals.locale, seniority.direction, jobLevel ?? "")
          : explainSeniority(args.signals.locale, args.signals.seniority, jobLevel),
      ].flatMap((line) => (line ? [line] : [])),
      ...[
        explainWorkplace(args.signals.locale, args.signals.remotePreference, location.workplace),
      ].flatMap((line) => (line ? [line] : [])),
      ...(location.city ? [explainCity(args.signals.locale, location.city)] : []),
    ]),
  }
}
