/**
 * Concrete, explainable facts about one offer: skills, salary band, work mode, city, company,
 * industry, seniority, contract and scope. Every fact has a stable key and a PL/EN label.
 * Feedback tags, the "what did you like?" chips, the preference model and similar offers all
 * speak in these keys. Deterministic and rule-based, no LLM.
 */
import { SENIORITY_RANK, type Seniority } from "@newrole/matching/types"
import {
  detectSeniority,
  functionTokens,
  normalizeCompany,
  normalizeTitle,
} from "@newrole/matching/normalization"
import { fold, tokens } from "@newrole/matching/text"
import { monthlyBasePln, placeFacts } from "src/server/jobs/offer-facts"
import { canonicalIndustry, industryFromRules } from "@newrole/profile/industry"
import type { FeedbackAspect } from "src/shared/feedback-aspects"
import type { OfferWorkMode } from "src/shared/offer-view"
import type { Bilingual, OfferForScoring } from "./types"

export type Fact = {
  key: string
  aspect: FeedbackAspect
  label: Bilingual
}

export type OfferProfile = {
  facts: Fact[]
  keys: Set<string>
  titleTokens: string[]
  roleKey: string | null
  skills: string[]
  seniority: Seniority | null
  workMode: OfferWorkMode
  city: string | null
  industry: string | null
  companyKey: string | null
  monthly: { min: number; max: number } | null
  contracts: string[]
}

type SkillDef = {
  id: string
  label: string
  aliases: string[]
  /** Short aliases that are too ambiguous for a description. */
  titleOnly?: string[]
  /** Title phrases that look like the alias but are not the skill. */
  notInTitle?: RegExp
}

/** Ids match src/server/profile/skills.ts where they overlap, so profile skills line up. */
const SKILLS: SkillDef[] = [
  { id: "kotlin", label: "Kotlin", aliases: ["kotlin"] },
  { id: "java", label: "Java", aliases: ["java"] },
  { id: "scala", label: "Scala", aliases: ["scala"] },
  {
    id: "golang",
    label: "Go",
    aliases: ["golang"],
    titleOnly: ["go"],
    notInTitle: /\bgo[- ]to[- ]market\b|\bgo[- ]live\b/,
  },
  { id: "rust", label: "Rust", aliases: ["rust"] },
  { id: "python", label: "Python", aliases: ["python"] },
  { id: "javascript", label: "JavaScript", aliases: ["javascript"], titleOnly: ["js"] },
  { id: "typescript", label: "TypeScript", aliases: ["typescript"], titleOnly: ["ts"] },
  { id: "nodejs", label: "Node.js", aliases: ["node.js", "nodejs"], titleOnly: ["node"] },
  { id: "react", label: "React", aliases: ["react", "react.js", "reactjs"] },
  { id: "react-native", label: "React Native", aliases: ["react native"] },
  { id: "angular", label: "Angular", aliases: ["angular"] },
  { id: "vue", label: "Vue", aliases: ["vue", "vue.js", "vuejs"] },
  { id: "nextjs", label: "Next.js", aliases: ["next.js", "nextjs"] },
  { id: "php", label: "PHP", aliases: ["php"] },
  { id: "laravel", label: "Laravel", aliases: ["laravel"] },
  { id: "symfony", label: "Symfony", aliases: ["symfony"] },
  { id: "ruby", label: "Ruby", aliases: ["ruby", "ruby on rails", "rails"] },
  { id: "csharp", label: "C#", aliases: ["c#", "csharp"] },
  { id: "dotnet", label: ".NET", aliases: [".net", "dotnet", "asp.net"] },
  { id: "cpp", label: "C++", aliases: ["c++", "cpp"] },
  { id: "swift", label: "Swift", aliases: ["swift", "swiftui"] },
  { id: "ios", label: "iOS", aliases: ["ios"] },
  { id: "android", label: "Android", aliases: ["android"] },
  { id: "flutter", label: "Flutter", aliases: ["flutter", "dart"] },
  {
    id: "spring",
    label: "Spring",
    aliases: ["spring boot", "spring framework"],
    titleOnly: ["spring"],
  },
  { id: "django", label: "Django", aliases: ["django"] },
  { id: "fastapi", label: "FastAPI", aliases: ["fastapi"] },
  { id: "elixir", label: "Elixir", aliases: ["elixir"] },
  { id: "sql", label: "SQL", aliases: ["sql"] },
  { id: "postgresql", label: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { id: "mysql", label: "MySQL", aliases: ["mysql"] },
  { id: "mongodb", label: "MongoDB", aliases: ["mongodb"] },
  { id: "redis", label: "Redis", aliases: ["redis"] },
  { id: "elasticsearch", label: "Elasticsearch", aliases: ["elasticsearch", "opensearch"] },
  { id: "kafka", label: "Kafka", aliases: ["kafka"] },
  { id: "rabbitmq", label: "RabbitMQ", aliases: ["rabbitmq"] },
  { id: "spark", label: "Spark", aliases: ["spark", "pyspark"] },
  { id: "airflow", label: "Airflow", aliases: ["airflow"] },
  { id: "dbt", label: "dbt", aliases: ["dbt"] },
  { id: "snowflake", label: "Snowflake", aliases: ["snowflake"] },
  { id: "databricks", label: "Databricks", aliases: ["databricks"] },
  { id: "bigquery", label: "BigQuery", aliases: ["bigquery"] },
  { id: "powerbi", label: "Power BI", aliases: ["power bi", "powerbi"] },
  { id: "tableau", label: "Tableau", aliases: ["tableau"] },
  { id: "aws", label: "AWS", aliases: ["aws", "amazon web services"] },
  { id: "gcp", label: "GCP", aliases: ["gcp", "google cloud"] },
  { id: "azure", label: "Azure", aliases: ["azure"] },
  { id: "kubernetes", label: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { id: "docker", label: "Docker", aliases: ["docker"] },
  { id: "terraform", label: "Terraform", aliases: ["terraform"] },
  { id: "ansible", label: "Ansible", aliases: ["ansible"] },
  { id: "linux", label: "Linux", aliases: ["linux"] },
  { id: "graphql", label: "GraphQL", aliases: ["graphql"] },
  { id: "grpc", label: "gRPC", aliases: ["grpc"] },
  { id: "microservices", label: "Microservices", aliases: ["microservices", "mikroserwisy"] },
  {
    id: "ml",
    label: "Machine Learning",
    aliases: ["machine learning", "uczenie maszynowe"],
    titleOnly: ["ml"],
  },
  { id: "llm", label: "LLM / GenAI", aliases: ["llm", "llms", "genai", "generative ai"] },
  { id: "pytorch", label: "PyTorch", aliases: ["pytorch"] },
  { id: "tensorflow", label: "TensorFlow", aliases: ["tensorflow"] },
  { id: "selenium", label: "Selenium", aliases: ["selenium"] },
  { id: "playwright", label: "Playwright", aliases: ["playwright"] },
  { id: "cypress", label: "Cypress", aliases: ["cypress"] },
  { id: "salesforce", label: "Salesforce", aliases: ["salesforce"] },
  { id: "sap", label: "SAP", aliases: ["sap"] },
  { id: "figma", label: "Figma", aliases: ["figma"] },
]

const SCOPE: { id: string; label: Bilingual; pattern: RegExp }[] = [
  {
    id: "greenfield",
    label: { pl: "Projekt od zera", en: "Greenfield" },
    pattern: /\bgreenfield\b|\bfrom scratch\b|\bod zera\b/,
  },
  {
    id: "people",
    label: { pl: "Zarządzanie zespołem", en: "People management" },
    pattern:
      /\bpeople management\b|\bmanage (a|the) team\b|\bzarzadzanie zespolem\b|\bdirect reports\b/,
  },
  {
    id: "product",
    label: { pl: "Firma produktowa", en: "Product company" },
    pattern: /\bproduct company\b|\bfirma produktowa\b|\bown product\b|\bwlasny produkt\b/,
  },
  {
    id: "startup",
    label: { pl: "Startup / scale-up", en: "Startup / scale-up" },
    pattern: /\bstart-?up\b|\bscale-?up\b/,
  },
  {
    id: "open-source",
    label: { pl: "Open source", en: "Open source" },
    pattern: /\bopen[- ]source\b/,
  },
  {
    id: "international",
    label: { pl: "Międzynarodowy zespół", en: "International team" },
    pattern: /\binternational team\b|\bmiedzynarodow\w* zesp/,
  },
]

const INDUSTRY_LABEL: Record<string, Bilingual> = {
  adtech: { pl: "adtech", en: "adtech" },
  martech: { pl: "martech", en: "martech" },
  ecommerce: { pl: "e-commerce", en: "e-commerce" },
  media: { pl: "media", en: "media" },
  fintech: { pl: "fintech", en: "fintech" },
  banking: { pl: "bankowość", en: "banking" },
  payments: { pl: "płatności", en: "payments" },
  health: { pl: "zdrowie", en: "healthcare" },
  saas: { pl: "SaaS", en: "SaaS" },
  gaming: { pl: "gry", en: "gaming" },
  logistics: { pl: "logistyka", en: "logistics" },
  insurance: { pl: "ubezpieczenia", en: "insurance" },
  telecom: { pl: "telekomunikacja", en: "telecom" },
}

const SENIORITY_LABEL: Record<Seniority, Bilingual> = {
  intern: { pl: "Staż", en: "Intern" },
  junior: { pl: "Junior", en: "Junior" },
  mid: { pl: "Mid / Regular", en: "Mid-level" },
  senior: { pl: "Senior", en: "Senior" },
  lead: { pl: "Lead", en: "Lead" },
  principal: { pl: "Staff / Principal", en: "Staff / Principal" },
  manager: { pl: "Manager", en: "Manager" },
  senior_manager: { pl: "Senior Manager", en: "Senior Manager" },
  director: { pl: "Dyrektor", en: "Director" },
  head: { pl: "Head of", en: "Head of" },
  vp: { pl: "VP", en: "VP" },
  c_level: { pl: "C-level", en: "C-level" },
}

const WORK_LABEL: Record<"remote" | "hybrid" | "onsite", Bilingual> = {
  remote: { pl: "100% zdalnie", en: "Fully remote" },
  hybrid: { pl: "Hybrydowo", en: "Hybrid" },
  onsite: { pl: "Stacjonarnie", en: "On-site" },
}

const CONTRACT: { id: string; label: Bilingual; pattern: RegExp }[] = [
  { id: "b2b", label: { pl: "B2B", en: "B2B" }, pattern: /\bb2b\b/ },
  {
    id: "uop",
    label: { pl: "Umowa o pracę", en: "Employment contract" },
    pattern: /\bumowa o prace\b|\buop\b|\bemployment contract\b|\bpermanent\b/,
  },
  {
    id: "contractor",
    label: { pl: "Kontrakt", en: "Contract" },
    pattern: /^contract$|\bcontractor\b|\bfreelance\b/,
  },
]

const TITLE_LEVEL =
  /\b(senior|junior|mid|regular|staff|principal|expert|sr|jr|starszy|starsza|mlodszy|mlodsza)\b\.?/gi

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function boundary(alias: string): RegExp {
  return new RegExp(`(?<![a-z0-9])${escape(alias)}(?![a-z0-9#+])`)
}

const SKILL_PATTERNS = SKILLS.map((skill) => ({
  skill,
  body: skill.aliases.map(boundary),
  title: [...skill.aliases, ...(skill.titleOnly ?? [])].map(boundary),
}))

const SKILL_BY_ID = new Map(SKILLS.map((skill) => [skill.id, skill]))

/** Skill ids found in the title and description, title hits first. */
export function extractSkills(title: string, description: string): string[] {
  const foldedTitle = fold(title)
  const foldedBody = fold(description.slice(0, 12_000))
  const found: string[] = []
  for (const item of SKILL_PATTERNS) {
    const titleHit = item.skill.notInTitle?.test(foldedTitle) ? item.body : item.title
    if (titleHit.some((re) => re.test(foldedTitle))) found.push(item.skill.id)
  }
  for (const item of SKILL_PATTERNS) {
    if (found.includes(item.skill.id)) continue
    if (item.body.some((re) => re.test(foldedBody))) found.push(item.skill.id)
  }
  // "React Native" is not also plain React; "Ruby on Rails" is Ruby.
  if (found.includes("react-native") && !/\breact(?!\s*native)/.test(foldedBody + foldedTitle)) {
    return found.filter((id) => id !== "react")
  }
  return found
}

/** A free-form skill (from a profile or a tag) mapped onto the lexicon id, when it is known. */
export function skillId(text: string): string | null {
  const folded = fold(text).trim()
  if (!folded) return null
  for (const skill of SKILLS) {
    if (fold(skill.label) === folded || skill.id === folded) return skill.id
    if (skill.aliases.includes(folded) || skill.titleOnly?.includes(folded)) return skill.id
  }
  return null
}

export function seniorityLabel(level: string): Bilingual {
  return SENIORITY_LABEL[level as Seniority] ?? { pl: level, en: level }
}

export function workLabel(mode: "remote" | "hybrid" | "onsite"): Bilingual {
  return WORK_LABEL[mode]
}

export function industryLabel(slug: string): Bilingual {
  return INDUSTRY_LABEL[slug] ?? { pl: slug, en: slug }
}

export function skillLabel(id: string): string {
  return SKILL_BY_ID.get(id)?.label ?? id
}

/** The job function without level words and suffixes: "Senior Kotlin Developer, Payments" → "Kotlin Developer". */
export function roleLabel(title: string): string {
  const bare = title
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  const head = bare.split(/\s[|–—-]\s|,|\s\/\s/)[0] ?? bare
  // "Senior/Mid Node.js Developer" leaves "/ Node.js Developer" once the levels are gone.
  const cleaned = head
    .replace(TITLE_LEVEL, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s/|,:;·•–—-]+|[\s/|,:;·•–—-]+$/g, "")
  return (cleaned || bare || title.trim()).slice(0, 48)
}

const GENERIC_TITLE_WORDS = new Set([
  "engineer",
  "developer",
  "specialist",
  "manager",
  "analyst",
  "consultant",
  "lead",
  "team",
  "software",
])

/** Dice on title tokens where generic words (engineer, manager, …) count half. */
export function titleSimilarity(a: string[], b: string[]): number {
  const A = new Set(a)
  const B = new Set(b)
  if (!A.size || !B.size) return 0
  const weight = (token: string) => (GENERIC_TITLE_WORDS.has(token) ? 0.5 : 1)
  let inter = 0
  let sizeA = 0
  let sizeB = 0
  for (const token of A) {
    sizeA += weight(token)
    if (B.has(token)) inter += weight(token)
  }
  for (const token of B) sizeB += weight(token)
  return (2 * inter) / (sizeA + sizeB)
}

/** Readable monthly salary band, rounded to whole thousands: "25–30k zł". */
export function salaryBand(min: number, max: number): Bilingual {
  const lo = Math.round(min / 1000)
  const hi = Math.round(max / 1000)
  const text = lo === hi ? `${lo}k` : `${lo}–${hi}k`
  return { pl: `${text} zł / mies.`, en: `${text} PLN / month` }
}

/** Five-thousand-wide bucket of the midpoint, so similar bands share a key. */
export function salaryBucket(min: number, max: number): number {
  return Math.floor((min + max) / 2 / 5000) * 5
}

function contractsFor(employmentType: string | null | undefined, text: string): string[] {
  const hay = `${fold(employmentType ?? "")}\n${text}`
  const out: string[] = []
  for (const item of CONTRACT) {
    if (item.id === "contractor") {
      if (
        item.pattern.test(fold(employmentType ?? "").trim()) ||
        /\bcontractor\b|\bfreelance\b/.test(text)
      )
        out.push(item.id)
      continue
    }
    if (item.pattern.test(hay)) out.push(item.id)
  }
  return out
}

export function seniorityOf(title: string, stored: string | null | undefined): Seniority | null {
  if (stored && stored in SENIORITY_RANK) return stored as Seniority
  return detectSeniority(normalizeTitle(title))
}

export function companyKey(name: string): string | null {
  const normalized = normalizeCompany(name || "")
  return normalized ? normalized : null
}

/** Every fact the offer states, in a stable order: role, stack, salary, remote, location, company, industry, seniority, contract, scope. */
export function profileOffer(offer: OfferForScoring): OfferProfile {
  const description = offer.description ?? ""
  const facts: Fact[] = []
  const role = roleLabel(offer.title)
  const roleTokens = tokens(role)
  const roleKey = roleTokens.length ? `role:${roleTokens.join(" ")}` : null
  if (roleKey) facts.push({ key: roleKey, aspect: "role", label: { pl: role, en: role } })

  const skills = extractSkills(offer.title, description).slice(0, 10)
  for (const id of skills) {
    const label = skillLabel(id)
    facts.push({ key: `skill:${id}`, aspect: "stack", label: { pl: label, en: label } })
  }

  const pay = monthlyBasePln({
    salaryMin: offer.salaryMin ?? null,
    salaryMax: offer.salaryMax ?? null,
    salaryCurrency: offer.salaryCurrency ?? null,
  })
  const monthly = pay.listed && pay.converted ? { min: pay.min, max: pay.max } : null
  if (monthly) {
    facts.push({
      key: `salary:${salaryBucket(monthly.min, monthly.max)}`,
      aspect: "salary",
      label: salaryBand(monthly.min, monthly.max),
    })
  }

  const place = placeFacts({
    locationText: offer.locationText ?? null,
    countryCode: offer.countryCode ?? null,
    countries: offer.countries ?? null,
    remoteRegions: offer.remoteRegions ?? null,
    workplaceType: offer.workplaceType ?? null,
  })
  if (place.workMode !== "unknown") {
    facts.push({
      key: `work:${place.workMode}`,
      aspect: "remote",
      label: WORK_LABEL[place.workMode],
    })
  }
  if (place.city) {
    facts.push({
      key: `city:${fold(place.city)}`,
      aspect: "location",
      label: { pl: place.city, en: place.city },
    })
  }

  const company = companyKey(offer.company)
  if (company && offer.company.trim()) {
    const name = offer.company.trim()
    facts.push({ key: `company:${company}`, aspect: "company", label: { pl: name, en: name } })
  }

  const industry =
    canonicalIndustry(offer.companyIndustry ?? null) ??
    industryFromRules(offer.title, description).industry
  if (industry) {
    facts.push({
      key: `industry:${industry}`,
      aspect: "industry",
      label: INDUSTRY_LABEL[industry] ?? { pl: industry, en: industry },
    })
  }

  const seniority = seniorityOf(offer.title, offer.seniorityLevel)
  if (seniority) {
    facts.push({
      key: `level:${seniority}`,
      aspect: "seniority",
      label: SENIORITY_LABEL[seniority],
    })
  }

  const folded = fold(`${offer.title}\n${description.slice(0, 12_000)}`)
  const contracts = contractsFor(offer.employmentType, folded)
  for (const id of contracts) {
    const item = CONTRACT.find((entry) => entry.id === id)!
    facts.push({ key: `contract:${id}`, aspect: "contract", label: item.label })
  }
  for (const item of SCOPE) {
    if (item.pattern.test(folded)) {
      facts.push({ key: `scope:${item.id}`, aspect: "scope", label: item.label })
    }
  }

  return {
    facts,
    keys: new Set(facts.map((fact) => fact.key)),
    titleTokens: functionTokens(normalizeTitle(role)).filter((token) => token !== "expert"),
    roleKey,
    skills,
    seniority,
    workMode: place.workMode,
    city: place.city,
    industry,
    companyKey: company,
    monthly,
    contracts,
  }
}

/** Key for a tag that is not one of the offer's facts (typed by hand). Matched as a phrase. */
export function textKey(tag: string): string {
  return `text:${tokens(tag).join(" ")}`
}

/** The fact a picked tag refers to (by either label or key), else a free-text key. */
export function tagToFact(tag: string, facts: Fact[]): Fact | null {
  const folded = fold(tag).trim()
  if (!folded) return null
  const hit = facts.find(
    (fact) => fact.key === tag || fold(fact.label.pl) === folded || fold(fact.label.en) === folded
  )
  if (hit) return hit
  const id = skillId(tag)
  if (id)
    return {
      key: `skill:${id}`,
      aspect: "stack",
      label: { pl: skillLabel(id), en: skillLabel(id) },
    }
  const key = textKey(tag)
  if (key === "text:") return null
  const label = tag.trim().slice(0, 60)
  return { key, aspect: "scope", label: { pl: label, en: label } }
}

/** Whether an offer carries a fact key. Free-text keys match as a phrase in title or description. */
export function offerHasKey(profile: OfferProfile, key: string, text: string): boolean {
  if (profile.keys.has(key)) return true
  if (key.startsWith("text:")) {
    const phrase = key.slice(5)
    if (!phrase) return false
    return boundary(phrase).test(text)
  }
  if (key.startsWith("salary:") && profile.monthly) {
    const bucket = Number(key.slice(7))
    return Math.abs(salaryBucket(profile.monthly.min, profile.monthly.max) - bucket) <= 5
  }
  return false
}

export function offerText(offer: OfferForScoring): string {
  return tokens(`${offer.title} ${(offer.description ?? "").slice(0, 12_000)}`).join(" ")
}
