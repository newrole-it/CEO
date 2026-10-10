import type { DomainRequirement, IndustryRelation } from "./industry"
import type { SalaryKind } from "./salary"

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
