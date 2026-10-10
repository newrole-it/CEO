import type { MatchingConfig } from "../../../matching/config"
import { detectSeniority } from "../../../matching/normalization"
import { fold } from "../../../matching/text"
import { explainIndustry, explainSalary, whyItMatches } from "./explain"
import {
  industryDelta,
  industryRelation,
  type DomainRequirement,
  type JobIndustry,
} from "./industry"
import { profileMonthlyPln, scoreSalary, type MonthlyRange, type ProfilePay } from "./salary"
import { asStringList, type IndustryMode } from "./schema"

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

function skillDelta(skills: string[], title: string, description: string): number {
  const haystack = fold(`${title}\n${description}`)
  const hits = skills.filter((skill) => {
    const needle = fold(skill)
    return needle.length > 1 && haystack.includes(needle)
  })
  return Math.min(6, hits.length * 2)
}

function seniorityDelta(profileSeniority: string | null, title: string): number {
  if (!profileSeniority) return 0
  const job = detectSeniority(fold(title))
  if (!job) return 0
  if (job === profileSeniority) return 4
  if (LEADERSHIP.has(job) && LEADERSHIP.has(profileSeniority)) return 3
  return 0
}

function locationDelta(signals: ProfileSignals, location: string, workplace: string): number {
  let delta = 0
  const place = fold(`${location} ${workplace}`)
  if (signals.remotePreference === "remote" && /\bremote\b/.test(place)) delta += 3
  if (signals.homeCity && place.includes(fold(signals.homeCity))) delta += 3
  return Math.min(4, delta)
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
  const skills = skillDelta(args.signals.skills, args.title, args.description)
  const seniority = seniorityDelta(args.signals.seniority, args.title)
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
    score: clampScore(args.queryScore + salary.delta + industry + skills + seniority + location),
    include: true,
    salaryDelta: salary.delta,
    industryDelta: industry,
    skillDelta: skills,
    seniorityDelta: seniority,
    locationDelta: location,
    disclosed: salary.disclosed,
    monthlyMin: salary.monthlyMin,
    monthlyMax: salary.monthlyMax,
    salaryMonthly: midpoint,
    industry: args.jobIndustry.industry,
    requirement: args.jobIndustry.domainExperience,
    relation,
    why: whyItMatches(industryLine, salaryLine),
    queryScore: args.queryScore,
  }
}
