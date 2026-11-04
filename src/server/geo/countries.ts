/**
 * The countries an offer is in. Every ingest writes them, so the index can be opened country by
 * country, and the countries this app refuses by design never reach it.
 */
import { normalizeLocation } from "@newrole/matching/normalization"
import { countryFromText } from "@newrole/matching/places"
import { fold } from "@newrole/matching/text"
import cityData from "./cities.json"

/** GeoNames city names of 100,000+ people → ISO code (scripts/gen-cities.mjs). Ambiguous names are absent. */
const CITY_COUNTRY: Record<string, string> = (cityData as { cities: Record<string, string> }).cities

/** Russia and Belarus. BLOCKED_COUNTRIES replaces the list; an empty value blocks nothing. */
export const DEFAULT_BLOCKED_COUNTRIES = ["RU", "BY"] as const

let cachedRaw: string | undefined
let cachedSet: Set<string> = new Set(DEFAULT_BLOCKED_COUNTRIES)

export function parseCountryList(raw: string): Set<string> {
  const codes = raw
    .split(/[\s,;]+/)
    .map((part) => part.trim().toUpperCase())
    .filter((part) => /^[A-Z]{2}$/.test(part))
  return new Set(codes)
}

export function blockedCountries(
  env: Record<string, string | undefined> = process.env
): Set<string> {
  const raw = env.BLOCKED_COUNTRIES
  if (raw == null) return new Set(DEFAULT_BLOCKED_COUNTRIES)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedSet = parseCountryList(raw)
  }
  return cachedSet
}

export function isBlockedCountry(code: string | null | undefined): boolean {
  if (!code) return false
  return blockedCountries().has(code.trim().toUpperCase())
}

/** An ISO code from an ATS field: "US", "us", "United States", "Polska". Null when it is not one. */
export function toCountryCode(value: string | null | undefined): string | null {
  const text = (value || "").trim()
  if (!text) return null
  if (/^[A-Za-z]{2}$/.test(text)) return countryFromText(text.toUpperCase())
  return countryFromText(text)
}

export type CountrySource = "structured" | "location" | "board"

/** "US-CA-Menlo Park", "IN-HR-Gurugram": country, subdivision, city. */
const CODE_PREFIX = /^\s*([A-Z]{2})-[A-Z0-9]{1,3}-/

/** Region words ATS locations use without saying remote ("Home based - EMEA", "NAMER"). */
const REGION_WORDS: Array<[string, RegExp]> = [
  ["EMEA", /\bemea\b/],
  ["APAC", /\b(apac|apj|asia[- ]pacific)\b/],
  ["AMERICAS", /\b(americas|amer|namer|north america|latam|latin america|noram)\b/],
  ["EU", /\b(europe|european union|eu)\b/],
  ["WORLD", /\b(worldwide|world ?wide|global|anywhere|international)\b/],
]

/** What normalizeLocation misses: the code prefix, a large city by name, and region words. */
export function extraPlace(text: string): { countries: string[]; regions: string[] } {
  const countries: string[] = []
  const prefix = text.match(CODE_PREFIX)?.[1]
  if (prefix && countryFromText(prefix)) countries.push(prefix)
  // "Remote, U.S.", "Remote (U.S.)": the dotted abbreviation the place matcher does not read.
  if (/\bu\.s\.(a\.)?(?![a-z])/i.test(text) && !countries.includes("US")) countries.push("US")
  const tail = prefix ? text.replace(CODE_PREFIX, "") : text
  for (const part of tail.split(/[,;|/()\n]|\s[-–]\s/)) {
    const code = CITY_COUNTRY[fold(part).replace(/\s+/g, " ").trim()]
    if (code && !countries.includes(code)) countries.push(code)
  }
  const folded = fold(text)
  const regions = REGION_WORDS.filter(([, pattern]) => pattern.test(folded)).map(
    ([region]) => region
  )
  return { countries, regions }
}

export type JobCountries = {
  /** In order: the ATS's own fields first, then the location text. Blocked ones removed. */
  countries: string[]
  /** EU, EMEA, WORLD, US, ... for a remote offer. UNKNOWN is left out. */
  remoteRegions: string[]
  source: CountrySource | null
  /** Countries the offer named that are on the blocked list. */
  blocked: string[]
}

export function resolveJobCountries(input: {
  locationText?: string | null
  workplaceType?: string | null
  structured?: (string | null | undefined)[]
}): JobCountries {
  const blockedSet = blockedCountries()
  const structured: string[] = []
  for (const value of input.structured ?? []) {
    const code = toCountryCode(value)
    if (code && !structured.includes(code)) structured.push(code)
  }
  const hint =
    input.workplaceType && input.workplaceType.toUpperCase() !== "UNKNOWN"
      ? input.workplaceType.toLowerCase()
      : ""
  const parsed = normalizeLocation(input.locationText ?? "", hint)
  const named = [...structured]
  for (const code of parsed.countries.map((item) => item.toUpperCase())) {
    if (!named.includes(code)) named.push(code)
  }
  const extra = extraPlace(input.locationText ?? "")
  if (!parsed.countries.length) {
    for (const code of extra.countries) if (!named.includes(code)) named.push(code)
  }
  const blocked = named.filter((code) => blockedSet.has(code))
  const countries = named.filter((code) => !blockedSet.has(code))
  let remoteRegions: string[] = parsed.remoteRegions.filter(
    (region) => region !== "UNKNOWN" && !blockedSet.has(region)
  )
  if (!remoteRegions.length && !named.length) remoteRegions = extra.regions
  const source: CountrySource | null = structured.some((code) => !blockedSet.has(code))
    ? "structured"
    : countries.length
    ? "location"
    : null
  return { countries, remoteRegions, source, blocked }
}

/** True when the offer says where it is: a country, or a remote region it is open to. */
export function hasPlace(result: JobCountries): boolean {
  return result.countries.length > 0 || result.remoteRegions.length > 0
}

/**
 * A board whose placed offers are all in one country lends that country to the offers it could not
 * place ("Remote", a site code). A board in several countries lends nothing.
 */
export function boardCountry(results: JobCountries[]): string | null {
  const seen = new Set<string>()
  for (const result of results) {
    if (result.source === "board") continue
    for (const code of result.countries) seen.add(code)
  }
  return seen.size === 1 ? [...seen][0] : null
}

export function withBoardCountry(result: JobCountries, country: string | null): JobCountries {
  if (hasPlace(result) || !country || result.blocked.length > 0) return result
  return { ...result, countries: [country], source: "board" }
}
