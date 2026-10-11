import { detectSeniority, normalizeTitle } from "../../../matching/normalization"
import { SENIORITY_RANK, type Seniority } from "../../../matching/types"
import { fold } from "../../../matching/text"

export type TechVerdict = boolean | null

/** Checked before a tech-function match. A non-tech role stays out even at a tech company. */
const OUT: RegExp[] = [
  /\b(security guard|ochroniarz|ochrona fizyczna)\b/,
  /\b(store associate|sales associate|shop assistant|store manager|shop manager|kierownik sklepu|cashier|kasjer|kasjerka|sprzedawca|sprzedawczyni|retail|merchandiser)\b/,
  /\b(warehouse|magazynier|forklift|order picker|kompletacj)\b/,
  /\b(truck driver|delivery driver|courier|kurier|kierowca)\b/,
  /\b(waiter|waitress|bartender|chef|cook|kucharz|kelner|housekeeper|receptionist|recepcjon|restaurant|hotel manager|kierownik restauracji)\b/,
  /\b(construction|bricklayer|carpenter|plumber|welder|electrician|site manager|kierownik budowy|murarz|budow)\b/,
  /\b(fashion designer|interior designer|fashion design|interior design|projektant wnetrz|projektantka wnetrz|projektant mody|projektantka mody)\b/,
  /\b(recruiter|recruit\w*|talent acquisition|talent partner|sourcer|human resources|people partner|hr business|rekruter|rekrutacj\w*)\b/,
  /\b(head of|director of|vp of) (people|sales|hr|human resources|finance|legal|talent|marketing|revenue)\b/,
  /\b(account executive|account excecutive|account manager|account management|account development|strategic account|business development|new business|\bbdr\b|\bsdr\b|\bbdm\b|handlowiec|sprzedaz\w*|representative)\b/,
  /\bsales\b/,
  /\b(accountant|bookkeeper|\bcfo\b|chief financial|finance manager|financial|finance|billing|pricing|ksiegow|kontroler finansow)\b/,
  /\b(lawyer|attorney|counsel|prawnik|radca prawny)\b/,
  /\b(chief marketing|\bcmo\b|\bpmm\b|marketing)\b/,
  /\b(people generalist|people partner|people operations|people ops|people team)\b/,
  /\b(customer support|customer service|customer success|call center|obsluga klienta)\b/,
  /\b(data entry|wprowadzanie danych)\b/,
  /\b(grocery|logistic|logistics|onboarding|transport|commercial manager|commercio|vendas|procurement|category management)\b/,
]

/** Engineering, product, data, design, IT operations, QA, and security engineering. Any seniority. */
const IN: RegExp[] = [
  /\b(software|engineer|engineering|developer|programmer|programista|programistka|deweloper|inzynier)\b/,
  /\b(devops|sre|site reliability|backend|frontend|front-end|back-end|full stack|fullstack|full-stack|\bios\b|\bandroid\b)\b/,
  /\b(data engineer|data scientist|data analyst|analityk danych|analityczka danych|machine learning|ml engineer|data platform|analytics engineer)\b/,
  /\b(product manager|product owner|product designer|product design|head of product|director of product|ux|ui|graphic designer|designer|projektant|projektantka)\b/,
  /\b(quality assurance|test engineer|sdet|tester|qa)\b/,
  /\b(security engineer|cybersecurity|cyber security|appsec|infosec|devsecops|soc analyst|security operations center)\b/,
  /\b(architect|architekt)\b/,
  /\b(sysadmin|system administrator|administrator systemow|infrastructure engineer|cloud engineer|platform engineer|it support|it operations|it ops|informatyk)\b/,
  /\b(scrum master|agile coach|technical writer)\b/,
  /\b(cto|cio|cpo|chief technology|chief information officer|chief product|chief data)\b/,
  /\bdesign\b/,
  /\bit\b/,
]

/** Generic business operations. Checked only after a tech function has failed to match. */
const SOFT_OUT: RegExp[] = [
  /\boperations specialist\b/,
  /\bescalation\b/,
  /\bgovernance\b/,
  /\bvendor operations\b/,
  /\bphone numbers\b/,
  /\bwriter\b/,
]

const NON_TECH_INDUSTRY =
  /\b(construction|retail|hospitality|hotel|restaurant|grocery|mining|agriculture|real estate)\b/
const TECH_INDUSTRY =
  /\b(software|technology|information technology|saas|fintech|internet|semiconductor|cybersecurity|telecom)\b/

/** Boards this catalog treats as a technology employer, unless the industry says otherwise. */
const TECH_SOURCES = new Set([
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "SMARTRECRUITERS",
  "TRAFFIT",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "PINPOINT",
  "BREEZY",
  "BAMBOOHR",
  "CAREER_SITE",
])

const LEADERSHIP = new Set<Seniority>(["director", "head", "vp", "c_level"])

export function classifySeniority(title: string): Seniority | null {
  return detectSeniority(normalizeTitle(title))
}

/** True, false, or null when the title is not enough to decide. */
export function classifyTechRole(title: string): TechVerdict {
  const text = fold(title)
  if (!text) return null
  if (OUT.some((pattern) => pattern.test(text))) return false
  if (IN.some((pattern) => pattern.test(text))) return true
  if (SOFT_OUT.some((pattern) => pattern.test(text))) return false
  return null
}

export function classifyRole(title: string): {
  seniority: Seniority | null
  isTechRole: TechVerdict
} {
  return { seniority: classifySeniority(title), isTechRole: classifyTechRole(title) }
}

/**
 * A definite non-tech role is out. A definite tech role is in.
 * An uncertain role follows the company. Unknown company stays unknown.
 */
export function inTechScope(isTechRole: TechVerdict, companyIsTech: TechVerdict): TechVerdict {
  if (isTechRole === false) return false
  if (isTechRole === true) return true
  if (companyIsTech === true) return true
  if (companyIsTech === false) return false
  return null
}

export function classifyCompany(args: {
  industry?: string | null
  sourceType?: string | null
}): TechVerdict {
  const industry = fold(args.industry || "")
  if (industry && NON_TECH_INDUSTRY.test(industry)) return false
  if (industry && TECH_INDUSTRY.test(industry)) return true
  if (args.sourceType && TECH_SOURCES.has(args.sourceType)) return true
  return null
}

/** Query-time boost. Matching weights stay untouched. The ceiling is 6. */
export function seniorityAffinity(
  profileSeniority: string | null | undefined,
  jobSeniority: string | null | undefined
): number {
  if (!profileSeniority || !jobSeniority) return 0
  if (profileSeniority === jobSeniority) return 6
  const profileRank = SENIORITY_RANK[profileSeniority as Seniority]
  const jobRank = SENIORITY_RANK[jobSeniority as Seniority]
  if (profileRank == null || jobRank == null) return 0
  if (profileRank === jobRank) return 6
  if (
    LEADERSHIP.has(profileSeniority as Seniority) &&
    LEADERSHIP.has(jobSeniority as Seniority) &&
    Math.abs(profileRank - jobRank) <= 2
  ) {
    return 4
  }
  if (Math.abs(profileRank - jobRank) === 1) return 3
  return 0
}

export const TECH_AREAS = ["engineering", "data", "devops", "qa", "product", "design"] as const
export type TechArea = (typeof TECH_AREAS)[number]

const AREA_PATTERNS: Array<[TechArea, RegExp]> = [
  [
    "design",
    /\b(product designer|ux|ui designer|ui|graphic designer|designer|projektant|projektantka)\b/,
  ],
  ["product", /\b(product manager|product owner|head of product|director of product|product)\b/],
  [
    "devops",
    /\b(devops|sre|site reliability|platform engineer|infrastructure|cloud engineer|it operations|it ops)\b/,
  ],
  ["qa", /\b(quality assurance|test engineer|sdet|tester|qa)\b/],
  [
    "data",
    /\b(data engineer|data scientist|data analyst|machine learning|ml engineer|analityk danych|analityczka danych|analytics)\b/,
  ],
  [
    "engineering",
    /\b(software|engineer|engineering|developer|programmer|programista|programistka|deweloper|frontend|backend|fullstack|full-stack|inzynier)\b/,
  ],
]

/** One specialism per title. Design and product win over a generic "engineer". */
export function techArea(title: string): TechArea | null {
  const text = fold(title)
  if (!text || OUT.some((pattern) => pattern.test(text))) return null
  if (SOFT_OUT.some((pattern) => pattern.test(text)) && !IN.some((pattern) => pattern.test(text))) {
    return null
  }
  for (const [area, pattern] of AREA_PATTERNS) {
    if (pattern.test(text)) return area
  }
  return null
}

/**
 * Drop a specialism the index barely has, so example phrases do not promise it.
 * The floor is 40 offers, or 0.5% of in-scope tech offers, whichever is higher.
 */
export function areasToMention(
  counts: Partial<Record<TechArea, number>>,
  totalTech: number
): TechArea[] {
  if (totalTech <= 0) return [...TECH_AREAS]
  const floor = Math.max(40, Math.round(totalTech * 0.005))
  const kept = TECH_AREAS.filter((area) => (counts[area] ?? 0) >= floor)
  return kept.length ? kept : [...TECH_AREAS]
}

const EXAMPLE_FOR: Record<TechArea, string> = {
  engineering: "Junior Frontend",
  data: "Senior Data Engineer",
  devops: "Platform Engineer",
  qa: "QA Engineer",
  product: "Product Manager",
  design: "Product Designer",
}

const EXAMPLE_ORDER: TechArea[] = ["engineering", "data", "design", "devops", "qa", "product"]

export function examplePhrases(areas: TechArea[]): string[] {
  const covered = new Set(areas)
  const phrases = EXAMPLE_ORDER.filter((area) => covered.has(area)).map((area) => EXAMPLE_FOR[area])
  return phrases.slice(0, 3)
}

const EARLY = new Set(["intern", "junior", "mid"])
const EXPERIENCED = new Set(["senior", "lead", "principal"])
const LEADING = new Set(["manager", "senior_manager", "head", "director", "vp", "c_level"])

/** One early, one experienced, and one leading title when the index has them. */
export function pickMixedPreview<T extends { seniority: string | null; key: string }>(
  items: T[],
  limit = 3
): T[] {
  const bands = [EARLY, EXPERIENCED, LEADING]
  const picked: T[] = []
  const seen = new Set<string>()
  for (const band of bands) {
    const match = items.find(
      (item) => item.seniority && band.has(item.seniority) && !seen.has(item.key)
    )
    if (!match) continue
    picked.push(match)
    seen.add(match.key)
  }
  for (const item of items) {
    if (picked.length >= limit) break
    if (seen.has(item.key)) continue
    picked.push(item)
    seen.add(item.key)
  }
  return picked.slice(0, limit)
}
