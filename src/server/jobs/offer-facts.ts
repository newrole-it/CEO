/**
 * Facts a job seeker can scan: where the job is, monthly base pay in PLN, and a short requirements list.
 * Display only. Matching still uses its own B2B comparison in packages/matching/normalization.ts.
 */
import { DEFAULT_CONFIG } from "@newrole/matching/config"
import { CITY_ALIASES, normalizeLocation } from "@newrole/matching/normalization"
import { countryFromText, regionCovers, remoteOpenTo } from "@newrole/matching/places"
import { fold } from "@newrole/matching/text"
import { blockedCountries, isBlockedCountry } from "src/server/geo/countries"
import { plnPerUnit } from "src/server/fx/nbp"
import type { NormalizedLocation } from "@newrole/matching/types"
import type { OfferWorkMode, PayNote } from "src/shared/offer-view"

/**
 * Rates into PLN: FX_<CODE>_PLN, else NBP table A (src/server/fx/nbp.ts, read by ensureFxRates),
 * else the defaults in packages/matching/config.ts. Any currency NBP lists converts.
 */
export const PLN_PER_UNIT = DEFAULT_CONFIG.fx.toPln

/**
 * Hourly offers become a monthly base with one assumption: 21 working days × 8 hours = 168 hours.
 * Daily offers use 21 working days. Yearly offers are divided by 12. No tax or B2B uplift.
 */
export const HOURS_PER_MONTH = DEFAULT_CONFIG.hoursPerMonth
export const DAYS_PER_MONTH = DEFAULT_CONFIG.daysPerMonth
export const MONTHS_PER_YEAR = DEFAULT_CONFIG.monthsPerYear

type Currency = string
type Period = "hour" | "day" | "month" | "year"

export type PlaceFacts = {
  inPoland: boolean | null
  city: string | null
  countryCode: string | null
  /** Every country the location names, in text order. */
  countries: string[]
  workMode: OfferWorkMode
  /** The parsed location, for telling which countries a remote offer is open to. */
  location: NormalizedLocation
}

export type MonthlyPay =
  | { listed: false }
  | { listed: true; converted: false; currency: string }
  | {
      listed: true
      converted: true
      min: number
      max: number
      note: PayNote | null
      currency: Currency
      period: Period
    }

const PERIOD_WORD: Record<string, Period> = {
  hour: "hour",
  hr: "hour",
  h: "hour",
  godz: "hour",
  day: "day",
  d: "day",
  dzien: "day",
  month: "month",
  mo: "month",
  msc: "month",
  mies: "month",
  year: "year",
  yr: "year",
  annum: "year",
  pa: "year",
}

/**
 * A bare currency code is how this app stores a monthly amount (the search pipeline writes
 * "PLN" for a month and "PLN/year" otherwise). When the number is too small or too large to be
 * a month, the period is inferred from its size and the UI says the offer did not state it.
 * A missing amount stays missing — this never invents a salary.
 */
function assumePeriod(amount: number, currency: Currency): Period {
  if (currency === "PLN") {
    if (amount < 500) return "hour"
    if (amount < 3_000) return "day"
    if (amount < 100_000) return "month"
    return "year"
  }
  if (amount < 300) return "hour"
  if (amount < 2_000) return "day"
  if (amount < 30_000) return "month"
  return "year"
}

function parseMoneyTag(raw: string | null): { currency: Currency; period: Period | null } | null {
  if (!raw) return null
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "")
  const match = compact.match(/^([a-z]{3})(?:\/([a-z]+))?$/)
  if (!match) return null
  const currency = match[1].toUpperCase()
  if (plnPerUnit(currency) == null) return null
  if (!match[2]) return { currency: currency as Currency, period: null }
  const period = PERIOD_WORD[match[2]]
  if (!period) return null
  return { currency: currency as Currency, period }
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null
  return value
}

function toMonthly(amount: number, period: Period): number {
  if (period === "hour") return amount * HOURS_PER_MONTH
  if (period === "day") return amount * DAYS_PER_MONTH
  if (period === "year") return amount / MONTHS_PER_YEAR
  return amount
}

function noteFor(period: Period, assumed: boolean): PayNote | null {
  if (period === "month") return assumed ? "assumed-month" : null
  if (assumed) return `assumed-${period}`
  return period
}

/** Monthly base in PLN. Yearly ÷ 12, hourly × 168, then × the FX rate. No salary when none is stored. */
export function monthlyBasePln(input: {
  salaryMin: number | null
  salaryMax: number | null
  salaryCurrency: string | null
}): MonthlyPay {
  let min = positive(input.salaryMin)
  let max = positive(input.salaryMax)
  if (min == null && max == null) return { listed: false }
  if (min != null && max != null && min > max) [min, max] = [max, min]
  const parsed = parseMoneyTag(input.salaryCurrency)
  if (!parsed) {
    return { listed: true, converted: false, currency: (input.salaryCurrency || "").trim() }
  }
  const sample = max ?? min!
  const period = parsed.period ?? assumePeriod(sample, parsed.currency)
  // Bare "PLN" on a month-sized amount is the stored form of an explicit month, not a guess.
  const assumed = parsed.period == null && period !== "month"
  const rate = plnPerUnit(parsed.currency) ?? 1
  const convert = (amount: number) => Math.round(toMonthly(amount, period) * rate)
  const monthlyMin = convert(min ?? max!)
  const monthlyMax = convert(max ?? min!)
  const lo = Math.min(monthlyMin, monthlyMax)
  const hi = Math.max(monthlyMin, monthlyMax)
  // A monthly base outside this band is not a wage we can show (bad source units, not a hidden salary).
  if (lo < 500 || hi > 500_000) {
    return { listed: true, converted: false, currency: parsed.currency }
  }
  return {
    listed: true,
    converted: true,
    min: lo,
    max: hi,
    note: noteFor(period, assumed),
    currency: parsed.currency,
    period,
  }
}

export function formatMonthlyPln(min: number, max: number, locale: "pl" | "en"): string {
  const fmt = new Intl.NumberFormat(locale === "pl" ? "pl-PL" : "en-GB", {
    maximumFractionDigits: 0,
  })
  if (min === max) return `${fmt.format(min)} zł`
  return `${fmt.format(min)}–${fmt.format(max)} zł`
}

export type OfferPayCard = {
  payListed: boolean
  payConverted: boolean
  payMin: number | null
  payMax: number | null
  payLabel: string | null
  payNote: PayNote | null
  payCurrency: string | null
  payFromOther: boolean
  paySourceUrl: string | null
}

/**
 * What the offer card shows. A copied salary keeps its source URL.
 * Missing amounts stay missing.
 */
export function offerPayFields(
  input: {
    salaryMin: number | null
    salaryMax: number | null
    salaryCurrency: string | null
    salarySourceUrl?: string | null
  },
  locale: "pl" | "en"
): { monthly: MonthlyPay; card: OfferPayCard } {
  const monthly = monthlyBasePln(input)
  const sourceUrl = input.salarySourceUrl ?? null
  if (monthly.listed && monthly.converted) {
    return {
      monthly,
      card: {
        payListed: true,
        payConverted: true,
        payMin: monthly.min,
        payMax: monthly.max,
        payLabel: formatMonthlyPln(monthly.min, monthly.max, locale),
        payNote: monthly.note,
        payCurrency: null,
        payFromOther: Boolean(sourceUrl),
        paySourceUrl: sourceUrl,
      },
    }
  }
  if (monthly.listed) {
    return {
      monthly,
      card: {
        payListed: true,
        payConverted: false,
        payMin: null,
        payMax: null,
        payLabel: null,
        payNote: null,
        payCurrency: monthly.currency,
        payFromOther: false,
        paySourceUrl: sourceUrl,
      },
    }
  }
  return {
    monthly,
    card: {
      payListed: false,
      payConverted: false,
      payMin: null,
      payMax: null,
      payLabel: null,
      payNote: null,
      payCurrency: null,
      payFromOther: false,
      paySourceUrl: sourceUrl,
    },
  }
}

/**
 * Poland or not, a canonical city when we recognise one, and remote / hybrid / on-site.
 * A bare city does not become on-site. Empty text stays unknown.
 */
export function placeFacts(input: {
  locationText: string | null
  countryCode: string | null
  workplaceType: string | null
  /** Countries stored with the offer at ingest. */
  countries?: string[] | null
  /** Remote regions stored with the offer at ingest ("Home based - EMEA" → EMEA). */
  remoteRegions?: string[] | null
}): PlaceFacts {
  const hint =
    input.workplaceType && input.workplaceType.toUpperCase() !== "UNKNOWN"
      ? input.workplaceType.toLowerCase()
      : ""
  const read = normalizeLocation(input.locationText ?? "", hint)
  const stored = (input.remoteRegions ?? []).filter(
    (region): region is NormalizedLocation["remoteRegions"][number] =>
      region !== "UNKNOWN" && REGIONS.has(region)
  )
  // A region the ingest found ("Home based - EMEA") makes the offer remote there even when the
  // location text alone does not say "remote".
  const parsed: NormalizedLocation = stored.length
    ? {
        ...read,
        remoteRegions: [
          ...new Set([...read.remoteRegions.filter((region) => region !== "UNKNOWN"), ...stored]),
        ],
        workModes: read.workModes.includes("remote")
          ? read.workModes
          : [...read.workModes.filter((mode) => mode !== "unknown"), "remote"],
        workMode: read.workMode === "unknown" ? "remote" : read.workMode,
      }
    : read
  const countries = new Set<string>()
  for (const code of input.countries ?? []) countries.add(code.toUpperCase())
  for (const code of parsed.countries) countries.add(code.toUpperCase())
  const column = input.countryCode?.trim().toUpperCase() ?? ""
  if (/^[A-Z]{2}$/.test(column)) countries.add(column)
  // Countries refused by design never show, even when the location text names one.
  for (const code of blockedCountries()) countries.delete(code)
  const city = parsed.cities[0]?.city ?? null
  const inPoland = countries.has("PL") ? true : countries.size > 0 ? false : null
  // A country stored with the offer wins; otherwise the first one the text names.
  const countryCode =
    /^[A-Z]{2}$/.test(column) && !isBlockedCountry(column) ? column : [...countries][0] ?? null
  const workMode: OfferWorkMode =
    parsed.workMode === "remote" || parsed.workMode === "hybrid" || parsed.workMode === "onsite"
      ? parsed.workMode
      : "unknown"
  return { inPoland, city, countryCode, countries: [...countries], workMode, location: parsed }
}

const REGIONS = new Set(["PL", "EU", "EMEA", "US", "AMERICAS", "APAC", "WORLD"])

/**
 * In the country, or remote and open to people there. remoteOpenTo reads only the location text,
 * so "Remote" with no region is open to every country. With `remoteHere` a country stored with
 * the offer (Ashby: "Remote" with an address in the United States) keeps it remote in that
 * country; a region that covers this country still lets it in.
 */
export function placeInCountry(
  place: PlaceFacts,
  country: string,
  { remoteHere = false } = {}
): boolean {
  if (isBlockedCountry(country)) return false
  if (place.countries.includes(country)) return true
  if (!remoteOpenTo(place.location, country)) return false
  return (
    !remoteHere ||
    !place.countries.length ||
    place.location.remoteRegions.some((region) => regionCovers(region, country))
  )
}

export function canonicalCity(value: string): string | null {
  const folded = fold(value.trim())
  if (!folded) return null
  const alias = CITY_ALIASES[folded]
  if (alias) return alias[0]
  const found = Object.values(CITY_ALIASES).find(([city]) => fold(city) === folded)
  return found?.[0] ?? null
}

/** The country of a canonical city name ("Warszawa" → "PL"). */
export function cityCountry(city: string): string | null {
  return Object.values(CITY_ALIASES).find(([name]) => name === city)?.[1] ?? null
}

export function cityNeedles(city: string): string[] {
  const needles = new Set<string>([city])
  for (const [alias, [canonical]] of Object.entries(CITY_ALIASES)) {
    if (canonical === city) needles.add(alias)
  }
  return [...needles]
}

// The words @newrole/matching/normalization reads as remote work (RE_REMOTE). Only narrows the database
// scan; placeInCountry decides. A text "Remote" on an offer stored with another country and no
// region still reads as open to every country (85 open offers in the list for Poland, 2026-11-03)
// unless the person turns on remoteHere.
const REMOTE_NEEDLES = [
  "remote",
  "zdaln",
  "work from home",
  "wfh",
  "home office",
  "anywhere",
  "telepraca",
  "distributed",
]

/**
 * Prisma filter that keeps every offer in the country or remote; placeInCountry decides.
 * Every write stores the countries (index/store.ts, index/reconcile.ts, search/pipeline.ts), so
 * the stored columns find every offer in a country. Matching the country's names and cities in
 * the location text found nothing more on 2026-11-03 (151,100 open offers, 182 countries) and
 * cost about a second per query: dozens of ILIKE patterns on every row of the table.
 */
export function inCountryWhere(country: string, { remote = true } = {}) {
  const contains = (needle: string) => ({
    locationText: { contains: needle, mode: "insensitive" as const },
  })
  // A blocked country matches nothing.
  if (isBlockedCountry(country)) return { id: { in: [] as string[] } }
  return {
    OR: [
      { countries: { has: country } },
      { countryCode: country },
      ...(remote
        ? [
            { workplaceType: "REMOTE" as const },
            { remoteRegions: { isEmpty: false } },
            ...REMOTE_NEEDLES.map(contains),
          ]
        : []),
    ],
  }
}

/** A country code from what someone typed: "PL", "Polska", "w USA", "in Germany". */
export function countryFromQuery(text: string): string | null {
  const trimmed = text.trim().replace(/^(w|we|in|na|do)\s+/i, "")
  if (!trimmed) return null
  return countryFromText(trimmed)
}

export type OfferFilter = {
  /** ISO code, or null for every country. */
  country: string | null
  city: string
  mode: "any" | "remote" | "hybrid" | "onsite"
  minMonthlyPln?: number
  /** Leave out remote offers the employer tied to another country (see placeInCountry). */
  remoteHere?: boolean
}

export function offerMatches(place: PlaceFacts, pay: MonthlyPay, filters: OfferFilter): boolean {
  if (
    filters.country &&
    !placeInCountry(place, filters.country, { remoteHere: filters.remoteHere })
  )
    return false
  if (filters.city && place.city !== filters.city) return false
  if (filters.mode !== "any" && place.workMode !== filters.mode) return false
  if (filters.minMonthlyPln != null && filters.minMonthlyPln > 0) {
    if (!pay.listed || !pay.converted) return false
    if (pay.max < filters.minMonthlyPln) return false
  }
  return true
}

export function citiesFrom(
  rows: { locationText: string | null; countryCode: string | null; workplaceType: string | null }[]
): { city: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const city = placeFacts(row).city
    if (!city) continue
    counts.set(city, (counts.get(city) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "pl"))
}

const REQUIREMENT_HEADING =
  /(?:requirements|wymagania|must[- ]have|qualifications|oczekujemy|what you(?:'|’)ll need)\s*[:\-–]?\s*/i

const REQUIREMENT_STOP =
  /\b(benefits|we offer|oferujemy|nice to have|responsibilities|obowiązki|obowiazki|about the role|o firmie|about us)\b/i

function splitPieces(text: string): string[] {
  return text
    .split(/\s*(?:[•·|;]|\s-\s|\s–\s)\s*/)
    .map((part) =>
      part
        .replace(/^[-–•]+\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/[.,;:\s]+$/g, "")
        .trim()
    )
    .filter((part) => part.length >= 3 && part.length <= 140)
}

/** A few concrete requirements. Returns nothing when the text does not list them. */
export function requirementExcerpt(description: string): string[] {
  const text = description.replace(/\s+/g, " ").trim()
  if (!text) return []
  const heading = text.match(REQUIREMENT_HEADING)
  if (heading && heading.index != null) {
    let slice = text.slice(heading.index + heading[0].length)
    const stop = slice.search(REQUIREMENT_STOP)
    if (stop > 20) slice = slice.slice(0, stop)
    const pieces = splitPieces(slice)
    if (pieces.length) return pieces.slice(0, 4)
    const sentence = slice.split(/(?<=\.)\s+/)[0]?.trim()
    if (sentence && sentence.length >= 8 && sentence.length <= 140)
      return [sentence.replace(/[.\s]+$/g, "")]
    return []
  }
  if (/[•·]|\s-\s/.test(text)) {
    const bullets = splitPieces(text)
    if (bullets.length >= 2) return bullets.slice(0, 4)
  }
  return []
}

export function descriptionExcerpt(description: string, max = 180): string {
  const clean = description.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const sentence = cut.lastIndexOf(". ")
  if (sentence >= 60) return cut.slice(0, sentence + 1)
  const space = cut.lastIndexOf(" ")
  const trimmed = (space >= 40 ? cut.slice(0, space) : cut).trimEnd()
  return `${trimmed}…`
}
