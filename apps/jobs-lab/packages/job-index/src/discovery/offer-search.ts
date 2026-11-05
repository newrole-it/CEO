/**
 * Turn search hits into offer actions. Pure: no network and no database.
 * A hit is kept only when the company and title can be read and the pay,
 * if any, is an explicit published figure. Estimates, closed posts, and
 * "up to" amounts are not used.
 */
import { decideFetch } from "@newrole/offers/source-policies"
import { CITY_ALIASES, parseSalaryText } from "@newrole/matching/normalization"
import { fold } from "@newrole/matching/text"
import { classifyHit } from "@newrole/ats/boards"
import { canonicalUrl } from "@newrole/ats/dedupe"
import { inferWorkplace, normalizeCompanyName } from "@newrole/ats/normalize"
import { monthlyBasePln } from "../jobs/offer-facts"
import type { WebHit } from "./web-search"
import { isPolishBoardHost } from "@newrole/offers/polish-boards"
import type { WorkplaceType } from "@newrole/ats/schemas"

const STOP = new Set([
  "a",
  "an",
  "the",
  "of",
  "and",
  "or",
  "for",
  "to",
  "in",
  "at",
  "on",
  "ds",
  "do",
  "w",
  "na",
  "dla",
])
const RANK = new Set(["junior", "senior", "staff", "principal", "associate", "intern", "sr", "jr"])
const FUNCTION = new Set([
  "director",
  "manager",
  "head",
  "vp",
  "vice",
  "president",
  "lead",
  "cto",
  "chief",
  "engineer",
  "engineering",
  "developer",
  "designer",
  "design",
  "product",
  "data",
  "security",
  "qa",
  "marketing",
  "sales",
  "finance",
  "hr",
  "people",
  "legal",
  "support",
  "analyst",
  "architect",
  "devops",
  "sre",
  "mobile",
  "frontend",
  "backend",
  "platform",
  "infra",
  "infrastructure",
  "dyrektor",
  "kierownik",
  "inzynier",
  "programista",
])
const NOISE = new Set([
  "remote",
  "hybrid",
  "onsite",
  "office",
  "poland",
  "polska",
  "warsaw",
  "warszawa",
  "krakow",
  "wroclaw",
  "gdansk",
  "poznan",
  "katowice",
  "lodz",
  "europe",
  "eu",
  "uk",
  "london",
  "job",
  "jobs",
  "oferta",
  "praca",
  "hiring",
  "vacancy",
])
const ROLE_HINT =
  /\b(director|manager|engineer|engineering|head|lead|developer|designer|dyrektor|kierownik|inzynier|inżynier|cto|vp|architect|devops|analyst|programist)\b/i
const SKIP_HOSTS = [
  "levels.fyi",
  "comparably.com",
  "glassdoor.com",
  "glassdoor.pl",
  "payscale.com",
  "salary.com",
  "indeed.com",
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "wikipedia.org",
  "reddit.com",
]
const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const
type Currency = (typeof CURRENCIES)[number]
type Period = "hour" | "day" | "month" | "year"

export type PayFigure = {
  min: number
  max: number
  currency: Currency
  period: Period
  raw: string
  sourceUrl: string
  rank: number
}

export type KnownOffer = {
  id: string
  company: string
  title: string
  canonicalUrl: string
  salaryMin: number | null
  salaryMax: number | null
}

export type PlannedCreate = {
  company: string
  title: string
  url: string
  canonicalUrl: string
  snippet: string
  locationText: string | null
  workplaceType: WorkplaceType
  mode: "snippet" | "fetch"
  pay: PayFigure | null
  host: string
}

export type PlannedEnrich = { id: string; pay: PayFigure }

export type OfferPlan = { create: PlannedCreate[]; enrich: PlannedEnrich[] }

export type SalaryFields = {
  salaryMin?: number | null
  salaryMax?: number | null
  salaryCurrency?: string | null
  salarySourceUrl?: string | null
  salarySourceRaw?: string | null
}

export function salaryTag(currency: string, period: string): string {
  if (period === "month") return currency
  return `${currency}/${period}`
}

export function hasPay(min?: number | null, max?: number | null): boolean {
  return (min != null && min > 0) || (max != null && max > 0)
}

/** Keep a salary copied from another listing when a later crawl has no pay of its own. */
export function keepExternalPay<T extends SalaryFields>(
  existing: SalaryFields | null,
  incoming: T
): T {
  if (!existing?.salarySourceUrl) {
    if (hasPay(incoming.salaryMin, incoming.salaryMax)) {
      return { ...incoming, salarySourceUrl: null, salarySourceRaw: null }
    }
    return incoming
  }
  if (hasPay(incoming.salaryMin, incoming.salaryMax)) {
    return { ...incoming, salarySourceUrl: null, salarySourceRaw: null }
  }
  return {
    ...incoming,
    salaryMin: existing.salaryMin ?? null,
    salaryMax: existing.salaryMax ?? null,
    salaryCurrency: existing.salaryCurrency ?? null,
    salarySourceUrl: existing.salarySourceUrl,
    salarySourceRaw: existing.salarySourceRaw ?? null,
  }
}

export function companiesMatch(left: string, right: string): boolean {
  const a = normalizeCompanyName(left)
  const b = normalizeCompanyName(right)
  return Boolean(a) && a === b
}

export function titlesEquivalent(left: string, right: string, company?: string): boolean {
  const a = roleParts(left, company)
  const b = roleParts(right, company)
  if (!a.role.length || !b.role.length) return false
  return a.role.join(" ") === b.role.join(" ") && a.rank.join(" ") === b.rank.join(" ")
}

/**
 * Overlapping explicit figures keep the band both sources state.
 * Disjoint figures keep the higher-ranked one. Nothing is averaged.
 * "Up to" / "from" alone never becomes a figure.
 */
export function choosePay(figures: PayFigure[]): PayFigure | null {
  const showable = figures.filter(payIsShowable)
  if (!showable.length) return null
  const best = Math.max(...showable.map((figure) => figure.rank))
  const top = showable.filter((figure) => figure.rank === best)
  const first = top[0]!
  const same = top.filter(
    (figure) => figure.currency === first.currency && figure.period === first.period
  )
  if (same.length !== top.length) return first
  const overlap = same.every((left) =>
    same.every((right) => left.max >= right.min && right.max >= left.min)
  )
  if (!overlap || same.length === 1) return first
  const min = Math.max(...same.map((figure) => figure.min))
  const max = Math.min(...same.map((figure) => figure.max))
  if (!(min > 0) || min > max) return first
  const raw = [...new Set(same.map((figure) => figure.raw))].join(" | ").slice(0, 240)
  const merged = { ...first, min, max, raw }
  return payIsShowable(merged) ? merged : first
}

export function figureFromText(text: string, sourceUrl: string, rank: number): PayFigure | null {
  if (payIsEstimate(text) || listingClosed(text)) return null
  const window = salaryWindow(text)
  if (!window) return null
  const parsed = parseSalaryText(window).flatMap((range) => {
    if (range.min == null || range.max == null) return []
    const currency = range.currency
    if (!CURRENCIES.includes(currency as Currency)) return []
    const period = range.period
    if (period !== "hour" && period !== "day" && period !== "month" && period !== "year") return []
    return [
      {
        min: range.min,
        max: range.max,
        currency: currency as Currency,
        period,
        raw: window.replace(/\s+/g, " ").trim().slice(0, 240),
        sourceUrl,
        rank,
      } satisfies PayFigure,
    ]
  })
  return choosePay(parsed)
}

export function storageMode(raw: string): "snippet" | "fetch" | "salary-only" {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return "salary-only"
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (skipHost(host)) return "salary-only"
  if (isPolishBoardHost(host)) return "snippet"
  const classified = classifyHit(raw)
  if (classified.kind === "polish") return "snippet"
  if (classified.kind === "workday" || classified.kind === "unverified-ats") return "salary-only"
  const decision = decideFetch(url)
  if (!decision.allow || decision.state === "link_only") return "salary-only"
  if (classified.kind === "ats" || classified.kind === "workable-shortcode") return "fetch"
  if (
    /\/(jobs?|careers?|oferta|oferty|praca|posting|vacancies|positions|opening)(\/|$)/i.test(
      url.pathname
    )
  ) {
    return "fetch"
  }
  return "salary-only"
}

export function fetchedOfferAccepted(status: number, parsedJobs: number): boolean {
  return status >= 200 && status < 400 && parsedJobs > 0
}

export function offerQuery(company: string, title: string): string {
  return `"${quote(title)}" "${quote(company)}"`
}

export const BOARD_DISCOVERY_QUERY = `"Director of Engineering" OR "Engineering Manager" (Poland OR Polska OR Warsaw OR Warszawa) (site:justjoin.it OR site:nofluffjobs.com OR site:bulldogjob.pl)`

export function pickFocus(
  jobs: Array<{ company: string; title: string }>,
  lastFocus: string | null
): { company: string; title: string; key: string } | null {
  const eligible = jobs.filter((job) => ROLE_HINT.test(job.title) && job.company.trim().length > 1)
  if (!eligible.length) return null
  const keyed = eligible.map((job) => ({
    company: job.company,
    title: job.title,
    key: `${normalizeCompanyName(job.company)}|${fold(job.title)}`,
  }))
  return keyed.find((job) => job.key !== lastFocus) ?? keyed[0]!
}

export function planOfferHits(
  hits: WebHit[],
  known: KnownOffer[],
  focus?: { company: string; title: string } | null
): OfferPlan {
  const seenUrls = new Set<string>()
  const candidates: Candidate[] = []
  for (const hit of hits) {
    const candidate = parseCandidate(hit, focus)
    if (!candidate) continue
    if (seenUrls.has(candidate.canonicalUrl)) continue
    seenUrls.add(candidate.canonicalUrl)
    candidates.push(candidate)
  }

  const enrichBuckets = new Map<string, { known: KnownOffer; pays: PayFigure[] }>()
  const createBuckets = new Map<string, PlannedCreate>()
  for (const candidate of candidates) {
    const match = known.find(
      (offer) =>
        urlsMatch(offer.canonicalUrl, candidate.canonicalUrl) ||
        (companiesMatch(offer.company, candidate.company) &&
          titlesEquivalent(offer.title, candidate.title, candidate.company))
    )
    if (match) {
      if (hasPay(match.salaryMin, match.salaryMax)) continue
      const bucket = enrichBuckets.get(match.id) ?? { known: match, pays: [] }
      if (candidate.pay) bucket.pays.push(candidate.pay)
      enrichBuckets.set(match.id, bucket)
      continue
    }
    if (candidate.mode === "salary-only") continue
    const key = `${normalizeCompanyName(candidate.company)}|${roleParts(
      candidate.title,
      candidate.company
    ).role.join(" ")}|${roleParts(candidate.title, candidate.company).rank.join(" ")}`
    const planned = toCreate(candidate)
    const current = createBuckets.get(key)
    createBuckets.set(key, current ? preferCreate(current, planned) : planned)
  }

  const enrich: PlannedEnrich[] = []
  for (const bucket of enrichBuckets.values()) {
    const pay = choosePay(bucket.pays)
    if (!pay) continue
    enrich.push({ id: bucket.known.id, pay })
  }
  return { create: [...createBuckets.values()], enrich }
}

type Candidate = Omit<PlannedCreate, "mode"> & { mode: "snippet" | "fetch" | "salary-only" }

function parseCandidate(
  hit: WebHit,
  focus?: { company: string; title: string } | null
): Candidate | null {
  let url: URL
  try {
    url = new URL(hit.url)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "")
  if (skipHost(host)) return null
  const title = (hit.title || "").replace(/\s+/g, " ").trim()
  const snippet = (hit.snippet || "").replace(/\s+/g, " ").trim()
  if (listingClosed(`${title} ${snippet}`)) return null
  const split = splitTitle(title)
  const blob = `${title} ${snippet} ${hit.url}`
  const company =
    cleanCompany(split.company) ||
    (focus && mentionsCompany(blob, focus.company) ? focus.company.trim() : null)
  if (!company) return null
  const role = split.role || title
  if (!ROLE_HINT.test(role)) return null
  let canonical = hit.url
  try {
    canonical = canonicalUrl(hit.url)
  } catch {
    return null
  }
  const mode = storageMode(hit.url)
  const rank = mode === "fetch" ? 3 : mode === "snippet" ? 2 : 1
  const place = placeHint(`${title} ${snippet}`)
  return {
    company,
    title: role,
    url: hit.url,
    canonicalUrl: canonical,
    snippet: snippet || role,
    locationText: place,
    workplaceType: inferWorkplace(undefined, `${title} ${snippet}`, snippet),
    mode,
    pay: figureFromText(`${title}. ${snippet}`, canonical, rank),
    host,
  }
}

function toCreate(candidate: Candidate): PlannedCreate {
  const mode = candidate.mode === "fetch" ? "fetch" : "snippet"
  return { ...candidate, mode }
}

function preferCreate(current: PlannedCreate, next: PlannedCreate): PlannedCreate {
  if (current.mode !== "fetch" && next.mode === "fetch") return next
  if (current.mode === "fetch" && next.mode !== "fetch") return current
  if (!current.pay && next.pay) return next
  if (current.pay && !next.pay) return current
  return current
}

function splitTitle(title: string): { role: string; company: string | null } {
  const cleaned = title.replace(/\s+/g, " ").trim()
  const parts = cleaned
    .split(/\s+[-|–—]\s+|\s+@\s+|\s+\bat\b\s+/i)
    .map((part) => part.trim())
    .filter(Boolean)
  if (parts.length >= 2) {
    const left = parts[0]!
    const right = parts[parts.length - 1]!
    const leftRole = ROLE_HINT.test(left)
    const rightRole = ROLE_HINT.test(right)
    if (leftRole && !rightRole) return { role: left, company: right }
    if (rightRole && !leftRole) return { role: right, company: left }
  }
  return { role: cleaned, company: null }
}

function cleanCompany(value: string | null): string | null {
  if (!value) return null
  const cleaned = value
    .replace(/\s+/g, " ")
    .replace(/[|–—-]+$/g, "")
    .trim()
  if (cleaned.length < 2 || cleaned.length > 80) return null
  if (ROLE_HINT.test(cleaned) && cleaned.split(/\s+/).length > 2) return null
  if (/^(jobs|careers|salary|wynagrodzenie)$/i.test(cleaned)) return null
  return cleaned
}

function mentionsCompany(text: string, company: string): boolean {
  const needle = fold(company)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
  if (needle.length < 3) return false
  const hay = ` ${fold(text).replace(/[^a-z0-9]+/g, " ")} `
  return hay.includes(` ${needle} `)
}

function roleParts(title: string, company?: string): { role: string[]; rank: string[] } {
  let text = fold(title).replace(/\([^)]*\)/g, " ")
  if (company) {
    const name = fold(company)
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
    if (name) text = text.replace(name, " ")
  }
  const tokens = text
    .split(/[^a-z0-9]+/)
    .flatMap((token) => (token === "vp" ? ["vice", "president"] : [token]))
    .filter((token) => token.length > 1 && !STOP.has(token) && !NOISE.has(token))
  return {
    role: tokens.filter((token) => FUNCTION.has(token)).sort(),
    rank: tokens.filter((token) => RANK.has(token)).sort(),
  }
}

function placeHint(text: string): string | null {
  const folded = fold(text)
  const keys = Object.keys(CITY_ALIASES)
    .filter((key) => key.length >= 4)
    .sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (folded.includes(key)) {
      const city = CITY_ALIASES[key]?.[0]
      const country = CITY_ALIASES[key]?.[1]
      if (city && country) return `${city}, ${country}`
    }
  }
  if (/\bpoland\b|\bpolska\b/.test(folded)) return "Poland"
  return null
}

function salaryWindow(text: string): string | null {
  const pattern = /(?:\d[\d\s.,]*\d|\d)\s*(?:k)?\s*(?:-|–|—|to)\s*(?:\d[\d\s.,]*\d|\d)\s*(?:k)?/gi
  let best: string | null = null
  let bestScore = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0
    const around = text.slice(Math.max(0, index - 24), index + match[0].length + 40)
    if (!/pln|eur|usd|gbp|chf|zł|zl|€|£|\$/i.test(around)) continue
    const score = Math.max(0, ...amountsIn(match[0]))
    if (score > bestScore) {
      bestScore = score
      best = around
    }
  }
  if (best) return best
  const single = text.match(
    /(?:(?:usd|eur|gbp|pln|chf|zł|zl|€|£|\$)\s*\d[\d\s.,]*\d|\d[\d\s.,]*\d\s*(?:k\s*)?(?:pln|eur|usd|gbp|chf|zł|zl))/i
  )
  if (!single || single.index == null) return null
  return text.slice(Math.max(0, single.index - 16), single.index + single[0].length + 24)
}

function amountsIn(text: string): number[] {
  return [...text.matchAll(/(\d[\d\s.,]*\d|\d)\s*(k\b)?/gi)].flatMap((match) => {
    const digits = (match[1] ?? "").replace(/[^\d]/g, "")
    const value = Number(digits)
    if (!Number.isFinite(value) || value <= 0) return []
    return [/k/i.test(match[2] ?? "") ? value * 1000 : value]
  })
}

function payIsEstimate(text: string): boolean {
  return /\b(estimated|estimate|est\. salary|szacunk\w*|anonymously)\b/i.test(text)
}

function listingClosed(text: string): boolean {
  const folded = fold(text)
  return /\b(wstrzymane|chwilowo wstrzym|paused|applications? (are )?paused|no longer accepting|position (has been )?closed)\b/.test(
    folded
  )
}

function payIsShowable(figure: PayFigure): boolean {
  const pay = monthlyBasePln({
    salaryMin: figure.min,
    salaryMax: figure.max,
    salaryCurrency: salaryTag(figure.currency, figure.period),
  })
  return pay.listed && pay.converted
}

function urlsMatch(left: string, right: string): boolean {
  try {
    return canonicalUrl(left) === canonicalUrl(right)
  } catch {
    return left === right
  }
}

function skipHost(host: string): boolean {
  return SKIP_HOSTS.some((item) => host === item || host.endsWith(`.${item}`))
}

function quote(value: string): string {
  return value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)
}
