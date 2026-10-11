import type { DomainRequirement, IndustryRelation } from "./industry"
import type { SalaryKind } from "./salary"
import type { SkillHit } from "./skills"

export type FitLine = { kind: "ok" | "warn"; text: string }

const TERM_PL: Record<string, string> = {
  adtech: "adtech",
  martech: "martech",
  ecommerce: "e-commerce",
  media: "mediach",
  fintech: "fintech",
  banking: "bankowości",
  payments: "płatnościach",
  health: "ochronie zdrowia",
  saas: "SaaS",
  gaming: "grach",
  logistics: "logistyce",
  insurance: "ubezpieczeniach",
  telecom: "telekomunikacji",
}

const TERM_EN: Record<string, string> = {
  adtech: "adtech",
  martech: "martech",
  ecommerce: "e-commerce",
  media: "media",
  fintech: "fintech",
  banking: "banking",
  payments: "payments",
  health: "healthcare",
  saas: "SaaS",
  gaming: "gaming",
  logistics: "logistics",
  insurance: "insurance",
  telecom: "telecom",
}

function termLabel(term: string, locale: "en" | "pl"): string {
  const key = term.toLowerCase()
  if (locale === "pl") return TERM_PL[key] ?? term
  return TERM_EN[key] ?? term
}

function money(value: number, locale: "en" | "pl"): string {
  return new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    maximumFractionDigits: 0,
  }).format(value)
}

function rangeText(min: number | null, max: number | null, locale: "en" | "pl"): string {
  if (min != null && max != null && min !== max)
    return `${money(min, locale)}–${money(max, locale)}`
  return money((min ?? max) as number, locale)
}

export function explainIndustry(args: {
  locale: "en" | "pl"
  industry: string | null
  requirement: DomainRequirement
  terms: string[]
  relation: IndustryRelation
  userIndustries: string[]
}): string {
  const yours = args.userIndustries.filter(Boolean).join(", ")
  const industry = args.industry ?? (args.locale === "pl" ? "nieznana" : "unknown")
  const terms = args.terms.map((term) => termLabel(term, args.locale)).join(", ")
  if (args.locale === "pl") {
    const requirement =
      args.requirement === "required"
        ? ` (wymagane doświadczenie w ${terms || "tej branży"})`
        : args.requirement === "preferred"
        ? ` (mile widziane doświadczenie w ${terms || "tej branży"})`
        : ""
    const relation =
      args.relation === "same"
        ? `zgodna z Twoją (${yours})`
        : args.relation === "adjacent"
        ? `bliska Twojej (${yours})`
        : args.relation === "different"
        ? `inna niż Twoja (${yours})`
        : args.userIndustries.length
        ? "nieznana względem Twojego profilu"
        : "nie ustawiono branży w profilu"
    return `Branża: ${industry}${requirement} – ${relation}`
  }
  const requirement =
    args.requirement === "required"
      ? ` (${terms || "domain"} experience required)`
      : args.requirement === "preferred"
      ? ` (${terms || "domain"} experience is a plus)`
      : ""
  const relation =
    args.relation === "same"
      ? `same as yours (${yours})`
      : args.relation === "adjacent"
      ? `adjacent to yours (${yours})`
      : args.relation === "different"
      ? `different from yours (${yours})`
      : args.userIndustries.length
      ? "unknown against your profile"
      : "no industry set on your profile"
  return `Industry: ${industry}${requirement} — ${relation}`
}

export function explainSalary(args: {
  locale: "en" | "pl"
  kind: SalaryKind
  monthlyMin: number | null
  monthlyMax: number | null
  floor: number | null
  target: number | null
}): string {
  if (args.kind === "undisclosed" || (args.monthlyMin == null && args.monthlyMax == null)) {
    return args.locale === "pl" ? "Wynagrodzenie: nie podano" : "Salary not disclosed"
  }
  const range = rangeText(args.monthlyMin, args.monthlyMax, args.locale)
  const floor = args.floor != null ? money(args.floor, args.locale) : null
  const target = args.target != null ? money(args.target, args.locale) : null
  if (args.locale === "pl") {
    if (args.kind === "far_below")
      return `Wynagrodzenie: ok. ${range} PLN/mies., wyraźnie poniżej progu ${floor ?? target} PLN`
    if (args.kind === "below")
      return `Wynagrodzenie: ok. ${range} PLN/mies., poniżej progu ${floor ?? target} PLN`
    if (args.kind === "straddle")
      return `Wynagrodzenie: ok. ${range} PLN/mies., widełki zachodzą na próg ${floor} PLN`
    if (args.kind === "target")
      return `Wynagrodzenie: ok. ${range} PLN/mies., sięga celu ${target} PLN`
    if (args.kind === "meets")
      return `Wynagrodzenie: ok. ${range} PLN/mies., powyżej progu ${floor} PLN`
    return `Wynagrodzenie: ok. ${range} PLN/mies.`
  }
  if (args.kind === "far_below")
    return `Salary: about ${range} PLN/month, clearly below your floor of ${floor ?? target} PLN`
  if (args.kind === "below")
    return `Salary: about ${range} PLN/month, below your floor of ${floor ?? target} PLN`
  if (args.kind === "straddle")
    return `Salary: about ${range} PLN/month, the range crosses your floor of ${floor} PLN`
  if (args.kind === "target")
    return `Salary: about ${range} PLN/month, reaches your target of ${target} PLN`
  if (args.kind === "meets")
    return `Salary: about ${range} PLN/month, above your floor of ${floor} PLN`
  return `Salary: about ${range} PLN/month`
}

export function whyItMatches(industryLine: string, salaryLine: string): string {
  return `${industryLine}. ${salaryLine}`
}

function joinLabels(labels: string[], locale: "en" | "pl"): string {
  const unique = [...new Set(labels)].slice(0, 3)
  if (unique.length <= 1) return unique[0] ?? ""
  const conjunction = locale === "pl" ? "i" : "and"
  if (unique.length === 2) return `${unique[0]} ${conjunction} ${unique[1]}`
  return `${unique.slice(0, -1).join(", ")} ${conjunction} ${unique[unique.length - 1]}`
}

export function explainSkills(
  locale: "en" | "pl",
  hits: SkillHit[],
  missing: SkillHit[]
): FitLine[] {
  const lines: FitLine[] = []
  const required = hits.filter((hit) => hit.zone === "required")
  const nice = hits.filter((hit) => hit.zone === "nice")
  const mentioned = hits.filter((hit) => hit.zone === "mentioned")
  if (required.length) {
    const names = joinLabels(
      required.map((hit) => hit.label),
      locale
    )
    lines.push({
      kind: "ok",
      text:
        locale === "pl"
          ? `${names} ${required.length > 1 ? "są" : "jest"} w Twoim profilu i w wymaganiach`
          : `${names} ${
              required.length > 1 ? "are" : "is"
            } in your profile and in the requirements`,
    })
  }
  if (nice.length) {
    const names = joinLabels(
      nice.map((hit) => hit.label),
      locale
    )
    lines.push({
      kind: "ok",
      text:
        locale === "pl"
          ? `${names} jest mile widziane i masz to w profilu`
          : `${names} ${nice.length > 1 ? "are" : "is"} a plus, and in your profile`,
    })
  }
  if (mentioned.length && !required.length) {
    const names = joinLabels(
      mentioned.map((hit) => hit.label),
      locale
    )
    lines.push({
      kind: "ok",
      text:
        locale === "pl"
          ? `${names} występuje w ogłoszeniu i w Twoim profilu`
          : `${names} appears in the posting and in your profile`,
    })
  }
  const gap = missing[0]
  if (gap) {
    lines.push({
      kind: "warn",
      text:
        locale === "pl"
          ? `W wymaganiach jest ${gap.label}, a nie ma tego w Twoim profilu`
          : `${gap.label} is required, and it isn't in your profile`,
    })
  }
  return lines
}

const SENIORITY_PL: Record<string, string> = {
  intern: "staż",
  junior: "junior",
  mid: "mid",
  senior: "senior",
  lead: "lead",
  principal: "principal",
  manager: "manager",
  senior_manager: "senior manager",
  head: "head",
  director: "director",
  vp: "VP",
  c_level: "C-level",
}

export function explainSeniority(
  locale: "en" | "pl",
  profileSeniority: string | null,
  jobSeniority: string | null
): FitLine | null {
  if (!profileSeniority || !jobSeniority) return null
  const label = locale === "pl" ? SENIORITY_PL[jobSeniority] ?? jobSeniority : jobSeniority
  if (jobSeniority === profileSeniority) {
    return {
      kind: "ok",
      text:
        locale === "pl"
          ? `${label}, zgodnie z Twoim doświadczeniem`
          : `${label}, in line with your experience`,
    }
  }
  return null
}

export function explainSeniorityGap(
  locale: "en" | "pl",
  direction: "lower" | "higher",
  jobSeniority: string
): FitLine {
  const label = locale === "pl" ? SENIORITY_PL[jobSeniority] ?? jobSeniority : jobSeniority
  if (locale === "pl") {
    return {
      kind: "warn",
      text:
        direction === "lower"
          ? `Poziom ${label}, niżej niż Twoje doświadczenie`
          : `Poziom ${label}, wyżej niż w Twoim profilu`,
    }
  }
  return {
    kind: "warn",
    text:
      direction === "lower"
        ? `${label} level, below your experience`
        : `${label} level, above your profile`,
  }
}

export function explainWorkplace(
  locale: "en" | "pl",
  preference: string | null,
  workplace: "remote" | "hybrid" | "onsite" | null
): FitLine | null {
  if (!preference || preference === "any" || !workplace) return null
  if (preference === workplace) {
    const ok =
      locale === "pl"
        ? workplace === "remote"
          ? "Zdalnie, tak jak wolisz"
          : workplace === "hybrid"
          ? "Hybrydowo, tak jak wolisz"
          : "Stacjonarnie, tak jak wolisz"
        : workplace === "remote"
        ? "Remote, as you prefer"
        : workplace === "hybrid"
        ? "Hybrid, as you prefer"
        : "On-site, as you prefer"
    return { kind: "ok", text: ok }
  }
  const job =
    locale === "pl"
      ? workplace === "remote"
        ? "Zdalnie"
        : workplace === "hybrid"
        ? "Hybrydowo"
        : "Stacjonarnie"
      : workplace === "remote"
      ? "Remote"
      : workplace === "hybrid"
      ? "Hybrid"
      : "On-site"
  const want =
    locale === "pl"
      ? preference === "remote"
        ? "pracę zdalną"
        : preference === "hybrid"
        ? "pracę hybrydową"
        : "pracę stacjonarną"
      : preference === "remote"
      ? "remote"
      : preference === "hybrid"
      ? "hybrid"
      : "on-site"
  return {
    kind: "warn",
    text: locale === "pl" ? `${job}, a wolisz ${want}` : `${job}, while you prefer ${want}`,
  }
}

export function explainCity(locale: "en" | "pl", city: string): FitLine {
  return {
    kind: "ok",
    text: locale === "pl" ? `${city} jest na Twojej liście` : `${city} is on your list`,
  }
}

export function explainSalaryLine(args: {
  locale: "en" | "pl"
  kind: SalaryKind
  floor: number | null
}): FitLine | null {
  if (args.floor == null && args.kind !== "target") {
    if (args.kind === "undisclosed" || args.kind === "neutral") return null
  }
  const floor =
    args.floor != null
      ? new Intl.NumberFormat(args.locale === "pl" ? "pl-PL" : "en-GB", {
          maximumFractionDigits: 0,
        }).format(args.floor)
      : null
  if (args.kind === "undisclosed") {
    if (args.floor == null) return null
    return {
      kind: "warn",
      text:
        args.locale === "pl"
          ? "Brak widełek, więc nie porównamy ich z Twoim minimum"
          : "No salary range, so it can't be compared with your minimum",
    }
  }
  if (args.kind === "meets" || args.kind === "target") {
    return {
      kind: "ok",
      text:
        args.locale === "pl"
          ? `Widełki powyżej Twojego minimum${floor ? ` (${floor} zł)` : ""}`
          : `Salary above your minimum${floor ? ` (${floor} PLN)` : ""}`,
    }
  }
  if (args.kind === "below" || args.kind === "far_below") {
    return {
      kind: "warn",
      text:
        args.locale === "pl"
          ? `Widełki poniżej Twojego minimum${floor ? ` (${floor} zł)` : ""}`
          : `Salary below your minimum${floor ? ` (${floor} PLN)` : ""}`,
    }
  }
  if (args.kind === "straddle") {
    return {
      kind: "warn",
      text:
        args.locale === "pl"
          ? `Widełki zachodzą na Twoje minimum${floor ? ` (${floor} zł)` : ""}`
          : `The range crosses your minimum${floor ? ` (${floor} PLN)` : ""}`,
    }
  }
  return null
}

export function explainIndustryLine(args: {
  locale: "en" | "pl"
  industry: string | null
  relation: IndustryRelation
  userIndustries: string[]
}): FitLine | null {
  if (!args.userIndustries.length || !args.industry) return null
  const label = termLabel(args.industry, args.locale)
  if (args.relation === "same") {
    return {
      kind: "ok",
      text:
        args.locale === "pl"
          ? `${label}, jak w Twoim doświadczeniu`
          : `${label}, like your experience`,
    }
  }
  if (args.relation === "adjacent") {
    return {
      kind: "warn",
      text:
        args.locale === "pl"
          ? `${label}: branża sąsiednia do Twojej`
          : `${label}: an industry next to yours`,
    }
  }
  if (args.relation === "different") {
    return {
      kind: "warn",
      text:
        args.locale === "pl"
          ? `${label}, inna niż Twoje doświadczenie`
          : `${label}, different from your experience`,
    }
  }
  return null
}

/** Up to three lines, with a trade-off included when one was computed. */
export function pickFitLines(lines: FitLine[], max = 3): FitLine[] {
  const ok = lines.filter((line) => line.kind === "ok")
  const warn = lines.filter((line) => line.kind === "warn")
  if (!warn.length) return ok.slice(0, max)
  if (!ok.length) return warn.slice(0, max)
  return [...ok.slice(0, max - 1), warn[0]].slice(0, max)
}
