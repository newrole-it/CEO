import { Prisma } from "@prisma/client"
import { ensureFxRates } from "src/server/fx/nbp"
import { isBlockedCountry } from "src/server/geo/countries"
import db from "db"
import { fold } from "@newrole/matching/text"
import { sourceOf, type BreakdownProfile, type SourceKind } from "src/server/preferences/breakdown"
import { scoreForFeed, type FeedReason, type FeedScore } from "src/server/preferences/feed"
import { buildPreferenceModel } from "src/server/preferences/model"
import type { OfferForScoring, PreferenceModel } from "src/server/preferences/types"
import { toSignals, type ProfileSignals } from "src/server/profile/rank"
import { asStringList } from "@newrole/profile/schema"
import type { FitOffer, OfferView } from "src/shared/offer-view"
import { profileReady } from "src/shared/shortlist"
import { cleanTags, tagMatcher, tagNeedles, type TaggedOffer } from "src/shared/title-tags"
import {
  canonicalCity,
  citiesFrom,
  cityCountry,
  cityNeedles,
  countryFromQuery,
  descriptionExcerpt,
  offerMatches,
  offerPayFields,
  placeFacts,
  placeInCountry,
  inCountryWhere,
  requirementExcerpt,
  type MonthlyPay,
  type OfferFilter,
  type PlaceFacts,
} from "./offer-facts"

export const BROWSE_PAGE = 24
export const BROWSE_BATCH = 80
/** Newest rows only. A salary floor lives further down the index than this window. */
export const UNFILTERED_BATCHES = 6
export const FILTERED_BATCHES = 40
const BEST_FIT_LIMIT = 4
const BEST_FIT_MIN = 56
/** For-you ranks this many of the newest matching offers. */
export const FOR_YOU_POOL = 600
const FOR_YOU_BATCH = 200
const CITY_SCAN = 2000

const REMOTE_WORDS = new Set(["remote", "zdalnie", "zdalna", "zdalny"])
const HYBRID_WORDS = new Set(["hybrid", "hybryda", "hybrydowo"])
const ONSITE_WORDS = new Set(["onsite", "stacjonarnie", "stacjonarna", "office"])

export type BrowseInput = {
  /** An ISO country code, or "any" for every country. */
  country?: string
  /** The country used when nothing else names one: the person's own (see jobs/country.ts). */
  defaultCountry?: string | null
  /** Leave out remote offers the employer tied to another country (see placeInCountry). */
  remoteHere?: boolean
  /** Old links: "pl" is Poland, "abroad" and "any" are every country. */
  where?: string
  city?: string
  mode?: string
  pay?: number | string
  cursor?: string
  /** Title tags (src/shared/title-tags.ts): an offer matching any one of them is kept. */
  tags?: string[]
  /** One more tag, as old links and saved searches name it. */
  phrase?: string
  q?: string
  location?: string
  /** Only this employer's offers (a company id). */
  companyId?: string
  /** Only offers this index first saw on or after this date. */
  seenSince?: Date
  /**
   * A test the caller adds on top (seniority, source, salary listed). It runs while scanning, so a
   * page still fills up when the test is strict.
   */
  keep?: (offer: KeepOffer) => boolean
}

/** What a caller's `keep` test sees: the card plus the stored facts it is built from. */
export type KeepOffer = FeedOffer & { companyId: string; seniorityLevel: string | null }

export type ResolvedBrowse = OfferFilter & {
  cursor: string
  tags: string[]
  location: string
  companyId: string
  seenSince: Date | null
  keep?: (offer: KeepOffer) => boolean
}

export type BrowseCursor = { at: Date; id: string }

/** An offer card plus where it came from and when we first saw it (ISO strings). */
export type FeedOffer = OfferView & {
  sourceKind: SourceKind
  /** ATS name ("Greenhouse"), "Claude" for MCP, null for a company site or link. */
  provider: string | null
  firstSeenAt: string
  lastSeenAt: string
  lastVerifiedAt: string | null
  /** The posting date the source states. Null when it states none. */
  publishedAt: string | null
}

export type ForYouOffer = FeedOffer & {
  /** 1–100, the same number the drawer breaks down (getOfferDetail). */
  score: number
  /** Up to two short reasons joined, for the compact card. */
  why: string
  reasons: FeedReason[]
  preferenceDelta: number
  industryDelta: number
}

export type ForYouPage = {
  offers: ForYouOffer[]
  page: number
  nextPage: number | null
  /** Ranked offers in the pool (after filters, without offers you already judged). */
  total: number
  /** The pool stopped at its size or scan limit; more offers match than `total`. */
  capped: boolean
  hasProfile: boolean
  hasFeedback: boolean
}

export type OfferPage = {
  offers: FeedOffer[]
  nextCursor: string | null
}

const jobSelect = {
  id: true,
  title: true,
  normalizedTitle: true,
  summary: true,
  descriptionText: true,
  locationText: true,
  countryCode: true,
  countries: true,
  remoteRegions: true,
  workplaceType: true,
  salaryMin: true,
  salaryMax: true,
  salaryCurrency: true,
  salarySourceUrl: true,
  originalUrl: true,
  canonicalUrl: true,
  lastSeenAt: true,
  firstSeenAt: true,
  lastVerifiedAt: true,
  publishedAt: true,
  sourceType: true,
  sourceBoardId: true,
  employmentType: true,
  seniorityLevel: true,
  viaIntermediary: true,
  companyId: true,
  company: { select: { name: true, industry: true } },
} satisfies Prisma.JobSelect

type JobRow = Prisma.JobGetPayload<{ select: typeof jobSelect }>

function parsePay(value: number | string | undefined): number | undefined {
  if (value == null || value === "") return undefined
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return undefined
    return Math.min(1_000_000, Math.round(value))
  }
  const text = value.trim().toLowerCase().replace(/\s+/g, "").replace(",", ".")
  const thousands = text.endsWith("k")
  const number = Number(thousands ? text.slice(0, -1) : text)
  if (!Number.isFinite(number) || number <= 0) return undefined
  return Math.min(1_000_000, Math.round(thousands ? number * 1000 : number))
}

function parseMode(value: string | undefined): OfferFilter["mode"] {
  const mode = (value || "any").trim().toLowerCase()
  if (mode === "remote" || mode === "hybrid" || mode === "onsite") return mode
  return "any"
}

/** undefined: nothing picked; null: every country. */
function parseCountry(input: BrowseInput): string | null | undefined {
  const value = (input.country || "").trim()
  if (value.toLowerCase() === "any") return null
  if (value) return countryFromQuery(value) ?? undefined
  const where = (input.where || "").trim().toLowerCase()
  if (where === "pl") return "PL"
  if (where === "abroad" || where === "any") return null
  return undefined
}

/** Words a person types in the location box, mapped onto the same filters as the offer list. */
export function interpretLocation(
  text: string,
  mode: OfferFilter["mode"]
): { country: string | null; city: string; location: string; mode: OfferFilter["mode"] } {
  const trimmed = text.trim().slice(0, 120)
  if (!trimmed) return { country: null, city: "", location: "", mode }
  const folded = fold(trimmed)
  if (REMOTE_WORDS.has(folded)) {
    return { country: null, city: "", location: "", mode: mode === "any" ? "remote" : mode }
  }
  if (HYBRID_WORDS.has(folded)) {
    return { country: null, city: "", location: "", mode: mode === "any" ? "hybrid" : mode }
  }
  if (ONSITE_WORDS.has(folded)) {
    return { country: null, city: "", location: "", mode: mode === "any" ? "onsite" : mode }
  }
  const city = canonicalCity(trimmed)
  if (city) return { country: cityCountry(city), city, location: "", mode }
  const country = countryFromQuery(trimmed)
  if (country) return { country, city: "", location: "", mode }
  return { country: null, city: "", location: trimmed, mode }
}

export function resolveBrowse(input: BrowseInput): ResolvedBrowse {
  const picked = parseCountry(input)
  let mode = parseMode(input.mode)
  const place = interpretLocation(input.location ?? "", mode)
  mode = place.mode
  const cityFromParam = input.city?.trim() ? canonicalCity(input.city) ?? "" : ""
  const city = cityFromParam || place.city
  // A picked country wins, then one the location names (a city names its country), then the default.
  const country =
    picked !== undefined
      ? picked
      : place.country ?? (city ? cityCountry(city) : null) ?? input.defaultCountry ?? null
  return {
    country,
    city,
    mode,
    minMonthlyPln: parsePay(input.pay),
    remoteHere: Boolean(input.remoteHere),
    tags: cleanTags([...(input.tags ?? []), input.phrase || input.q]),
    location: place.location,
    cursor: (input.cursor ?? "").trim().slice(0, 120),
    companyId: (input.companyId ?? "").trim().slice(0, 64),
    seenSince: input.seenSince ?? null,
    keep: input.keep,
  }
}

/**
 * Unfiltered browsing only reads the newest window. A minimum salary (and any other
 * filter applied after the query) has to keep walking, or older paid offers look like
 * an empty list.
 */
export function browseScanCap(filters: {
  country: string | null
  city: string
  mode: string
  minMonthlyPln?: number
  tags?: string[]
  location?: string
  companyId?: string
  seenSince?: Date | null
  keep?: unknown
}): number {
  const selective =
    (filters.minMonthlyPln != null && filters.minMonthlyPln > 0) ||
    Boolean(filters.country) ||
    filters.mode !== "any" ||
    Boolean(filters.city) ||
    Boolean(filters.tags?.length) ||
    Boolean(filters.location) ||
    Boolean(filters.companyId) ||
    Boolean(filters.seenSince) ||
    Boolean(filters.keep)
  return selective ? FILTERED_BATCHES : UNFILTERED_BATCHES
}

/** The earliest date an offer is known to exist: the employer's posting date when it is earlier
 * than the first time this index saw the offer, else that first sighting. */
export function knownSince(offer: { firstSeenAt: string; publishedAt: string | null }): string {
  return offer.publishedAt && offer.publishedAt < offer.firstSeenAt
    ? offer.publishedAt
    : offer.firstSeenAt
}

export function encodeCursor(at: Date, id: string): string {
  return `${at.getTime().toString(36)}_${id}`
}

export function decodeCursor(value: string | undefined): { at: Date; id: string } | null {
  if (!value) return null
  const split = value.indexOf("_")
  if (split <= 0) return null
  const at = new Date(Number.parseInt(value.slice(0, split), 36))
  const id = value.slice(split + 1)
  if (!id || Number.isNaN(at.getTime())) return null
  return { at, id }
}

export function browseQuery(filters: ResolvedBrowse, cursor?: string | null): string {
  const params = new URLSearchParams()
  for (const tag of filters.tags) params.append("q", tag)
  if (filters.location) params.set("location", filters.location)
  if (filters.country) params.set("country", filters.country)
  if (filters.city) params.set("city", filters.city)
  if (filters.mode !== "any") params.set("mode", filters.mode)
  if (filters.minMonthlyPln) params.set("pay", String(filters.minMonthlyPln))
  if (cursor) params.set("cursor", cursor)
  const query = params.toString()
  return query ? `/jobs?${query}` : "/jobs"
}

export async function scanUntilPage<T>(args: {
  maxBatches: number
  batchSize: number
  pageSize: number
  start: BrowseCursor | null
  load: (cursor: BrowseCursor | null) => Promise<T[]>
  cursorOf: (row: T) => BrowseCursor
  accept: (row: T) => boolean
}): Promise<{ kept: T[]; next: BrowseCursor | null }> {
  let cursor = args.start
  let moved = false
  const kept: T[] = []
  let exhausted = false

  for (let batch = 0; batch < args.maxBatches && kept.length < args.pageSize; batch += 1) {
    const rows = await args.load(cursor)
    if (rows.length === 0) {
      exhausted = true
      break
    }
    let examinedAll = true
    for (const row of rows) {
      cursor = args.cursorOf(row)
      moved = true
      if (!args.accept(row)) continue
      kept.push(row)
      if (kept.length >= args.pageSize) {
        examinedAll = false
        break
      }
    }
    if (examinedAll && rows.length < args.batchSize) exhausted = true
    if (!examinedAll || exhausted) break
  }

  return { kept, next: exhausted || !moved || !cursor ? null : cursor }
}

function listWhere(filters: ResolvedBrowse, cursor: BrowseCursor | null): Prisma.JobWhereInput {
  const and: Prisma.JobWhereInput[] = []
  if (cursor) {
    // The bare bound lets the (lastSeenAt, id) index start at the cursor instead of the newest row.
    and.push({ lastSeenAt: { lte: cursor.at } })
    and.push({
      OR: [{ lastSeenAt: { lt: cursor.at } }, { lastSeenAt: cursor.at, id: { lt: cursor.id } }],
    })
  }
  if (filters.mode !== "any") {
    const mode = filters.mode.toUpperCase() as "REMOTE" | "HYBRID" | "ONSITE"
    and.push({ workplaceType: { in: [mode, "UNKNOWN"] } })
  }
  if (filters.country) and.push(inCountryWhere(filters.country))
  if (filters.city) {
    and.push({
      OR: cityNeedles(filters.city).map((needle) => ({
        locationText: { contains: needle, mode: "insensitive" as const },
      })),
    })
  }
  if (filters.location) {
    and.push({ locationText: { contains: filters.location, mode: "insensitive" } })
  }
  if (filters.companyId) and.push({ companyId: filters.companyId })
  if (filters.seenSince) and.push({ firstSeenAt: { gte: filters.seenSince } })
  if (filters.minMonthlyPln != null && filters.minMonthlyPln > 0) {
    and.push({ OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] })
  }
  const tags = tagsWhere(filters.tags)
  if (tags) and.push(tags)
  return {
    status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] },
    ...(and.length ? { AND: and } : {}),
  }
}

/**
 * Rows any of the tags may match, as a LIKE on the words each tag needs; tagMatcher decides on the
 * rows that come back. Null when there are no tags, or a tag has a way to match with no word to
 * look for, which leaves the whole test to tagMatcher.
 */
export function tagsWhere(tags: string[]): Prisma.JobWhereInput | null {
  const ways: Prisma.JobWhereInput[] = []
  for (const tag of tags) {
    const needles = tagNeedles(tag)
    if (!needles) return null
    for (const { words, company } of needles) {
      ways.push({
        AND: words.map((word) => ({
          OR: [
            { title: { contains: word, mode: "insensitive" as const } },
            { normalizedTitle: { contains: word, mode: "insensitive" as const } },
            ...(company
              ? [{ company: { name: { contains: word, mode: "insensitive" as const } } }]
              : []),
          ],
        })),
      })
    }
  }
  return ways.length ? { OR: ways } : null
}

/**
 * The card for a row. With a country in view, an offer that names several countries shows that one
 * (and a city there), so a list for Poland does not show "Remote · Canada" for an offer open to Poland.
 */
function toOfferView(
  job: JobRow,
  locale: "pl" | "en",
  country: string | null = null
): { view: FeedOffer; place: PlaceFacts; pay: MonthlyPay } {
  const description = (job.descriptionText || job.summary || "").replace(/\s+/g, " ").trim()
  const parsed = placeFacts({
    locationText: job.locationText,
    countryCode: job.countryCode,
    countries: job.countries,
    remoteRegions: job.remoteRegions,
    workplaceType: job.workplaceType,
  })
  const place: PlaceFacts =
    country && parsed.countries.includes(country)
      ? {
          ...parsed,
          countryCode: country,
          city: parsed.location.cities.find((item) => item.country === country)?.city ?? null,
        }
      : parsed
  const { monthly: pay, card } = offerPayFields(
    {
      salaryMin: job.salaryMin,
      salaryMax: job.salaryMax,
      salaryCurrency: job.salaryCurrency,
      salarySourceUrl: job.salarySourceUrl,
    },
    locale
  )
  const view: FeedOffer = {
    ...sourceOf({
      sourceType: job.sourceType,
      sourceBoardId: job.sourceBoardId,
      hasDescription: Boolean(description),
    }),
    firstSeenAt: job.firstSeenAt.toISOString(),
    lastSeenAt: job.lastSeenAt.toISOString(),
    publishedAt: job.publishedAt?.toISOString() ?? null,
    lastVerifiedAt: job.lastVerifiedAt?.toISOString() ?? null,
    id: job.id,
    title: job.title,
    company: job.company.name,
    viaIntermediary: job.viaIntermediary,
    url: job.originalUrl || job.canonicalUrl,
    excerpt: descriptionExcerpt(description),
    description,
    requirements: requirementExcerpt(description),
    inPoland: place.inPoland,
    city: place.city,
    countryCode: place.countryCode,
    workMode: place.workMode,
    ...card,
  }
  return { view, place, pay }
}

function rowAccepted(
  row: JobRow,
  filters: ResolvedBrowse,
  matchTags: (offer: TaggedOffer) => boolean
): boolean {
  if (
    !matchTags({
      title: row.title,
      normalizedTitle: row.normalizedTitle,
      company: row.company.name,
    })
  ) {
    return false
  }
  if (filters.location) {
    const hay = (row.locationText || "").toLocaleLowerCase("pl")
    if (!hay.includes(filters.location.toLocaleLowerCase("pl"))) return false
  }
  const { view, place, pay } = toOfferView(row, "pl")
  if (!offerMatches(place, pay, filters)) return false
  return (
    !filters.keep ||
    filters.keep({ ...view, companyId: row.companyId, seniorityLevel: row.seniorityLevel })
  )
}

export async function listOfferPage(input: BrowseInput, locale: "pl" | "en"): Promise<OfferPage> {
  await ensureFxRates()
  const filters = resolveBrowse(input)
  const matchTags = tagMatcher(filters.tags)
  const scanned = await scanUntilPage({
    maxBatches: browseScanCap(filters),
    batchSize: BROWSE_BATCH,
    pageSize: BROWSE_PAGE,
    start: decodeCursor(filters.cursor),
    load: (cursor) =>
      db.job.findMany({
        where: listWhere(filters, cursor),
        select: jobSelect,
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: BROWSE_BATCH,
      }),
    cursorOf: (row) => ({ at: row.lastSeenAt, id: row.id }),
    accept: (row) => rowAccepted(row, filters, matchTags),
  })
  return {
    offers: scanned.kept.map((row) => toOfferView(row, locale, filters.country).view),
    nextCursor: scanned.next ? encodeCursor(scanned.next.at, scanned.next.id) : null,
  }
}

function profileUseful(profile: {
  linkedinImportedAt: Date | null
  headline: string | null
  currentTitle: string | null
  skills: unknown
  industries: unknown
  salaryFloor: number | null
  homeCity: string | null
  seniority: string | null
}): boolean {
  if (profileReady(profile)) return true
  if (asStringList(profile.skills).length || asStringList(profile.industries).length) return true
  if (profile.salaryFloor != null || profile.homeCity || profile.seniority) return true
  return false
}

function rowOffer(row: JobRow): OfferForScoring {
  return {
    id: row.id,
    title: row.title,
    description: (row.descriptionText || row.summary || "").slice(0, 12_000),
    company: row.company.name,
    companyIndustry: row.company.industry,
    locationText: row.locationText,
    countryCode: row.countryCode,
    workplaceType: row.workplaceType,
    salaryMin: row.salaryMin,
    salaryMax: row.salaryMax,
    salaryCurrency: row.salaryCurrency,
    seniorityLevel: row.seniorityLevel,
    employmentType: row.employmentType,
  }
}

export function parsePage(value: number | string | undefined | null): number {
  const page = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10)
  if (!Number.isFinite(page) || page < 1) return 1
  return Math.min(50, Math.floor(page))
}

/** Score a row for the For-you feed. Shared by the feed and the offer drawer. */
export function scoreRow(
  row: JobRow,
  ctx: {
    signals: ProfileSignals | null
    profile: BreakdownProfile | null
    model: PreferenceModel | null
    locale: "pl" | "en"
    now: Date
    country?: string | null
  }
): { view: FeedOffer; score: FeedScore } {
  const { view } = toOfferView(row, ctx.locale, ctx.country ?? null)
  const score = scoreForFeed({
    offer: rowOffer(row),
    signals: ctx.signals,
    profile: ctx.profile,
    model: ctx.model,
    firstSeenAt: row.firstSeenAt,
    publishedAt: row.publishedAt,
    sourceKind: view.sourceKind,
    provider: view.provider,
    locale: ctx.locale,
    now: ctx.now,
  })
  return { view, score }
}

/**
 * "Dla Ciebie": the newest offers that pass the browse filters (up to FOR_YOU_POOL), minus
 * offers already liked or passed, ordered by profile fit + learned preferences, or with
 * sort "new" by knownSince, newest first. Paged by number because the order is a ranking,
 * not a time cursor.
 */
export async function listForYou(
  input: BrowseInput & { page?: number | string; sort?: "fit" | "new" },
  userId: number | null,
  locale: "pl" | "en"
): Promise<ForYouPage> {
  await ensureFxRates()
  const page = parsePage(input.page)
  const empty: ForYouPage = {
    offers: [],
    page,
    nextPage: null,
    total: 0,
    capped: false,
    hasProfile: false,
    hasFeedback: false,
  }
  if (!userId) return empty
  const [profile, model] = await Promise.all([
    db.candidateProfile.findUnique({ where: { userId } }),
    buildPreferenceModel(userId),
  ])
  const hasProfile = Boolean(profile && profileUseful(profile))
  const hasFeedback = model.liked + model.disliked > 0
  if (!hasProfile && !hasFeedback) return empty
  const filters = resolveBrowse(input)
  const matchTags = tagMatcher(filters.tags)
  const scanned = await scanUntilPage({
    maxBatches: browseScanCap(filters) === UNFILTERED_BATCHES ? 4 : FILTERED_BATCHES,
    batchSize: FOR_YOU_BATCH,
    pageSize: FOR_YOU_POOL,
    start: null,
    load: (cursor) =>
      db.job.findMany({
        where: listWhere(filters, cursor),
        select: jobSelect,
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: FOR_YOU_BATCH,
      }),
    cursorOf: (row) => ({ at: row.lastSeenAt, id: row.id }),
    accept: (row) => !model.decided.has(row.id) && rowAccepted(row, filters, matchTags),
  })
  const ctx = {
    signals: hasProfile && profile ? toSignals(profile, locale) : null,
    profile: hasProfile ? profile : null,
    model: hasFeedback ? model : null,
    locale,
    now: new Date(),
    country: filters.country,
  }
  const newest = input.sort === "new"
  const ranked = scanned.kept
    .map((row) => scoreRow(row, ctx))
    .sort(
      (a, b) =>
        (newest ? knownSince(b.view).localeCompare(knownSince(a.view)) : 0) ||
        b.score.score - a.score.score ||
        b.view.lastSeenAt.localeCompare(a.view.lastSeenAt) ||
        a.view.id.localeCompare(b.view.id)
    )
  const start = (page - 1) * BROWSE_PAGE
  const offers = ranked.slice(start, start + BROWSE_PAGE).map(({ view, score }) => ({
    ...view,
    score: score.score,
    why: score.reasons
      .filter((reason) => reason.kind === "ok")
      .map((reason) => reason.text)
      .slice(0, 2)
      .join(" · "),
    reasons: score.reasons,
    preferenceDelta: score.preference.delta,
    industryDelta: score.industryDelta,
  }))
  return {
    offers,
    page,
    nextPage: start + BROWSE_PAGE < ranked.length ? page + 1 : null,
    total: ranked.length,
    capped: scanned.next !== null,
    hasProfile,
    hasFeedback,
  }
}

/** The short "best fits" strip above the list: the top of For-you with a clear reason. */
export async function listBestFits(
  input: BrowseInput,
  userId: number | null,
  locale: "pl" | "en"
): Promise<{ offers: FitOffer[]; hasProfile: boolean }> {
  const feed = await listForYou({ ...input, page: 1 }, userId, locale)
  const offers = feed.offers
    .filter((offer) => offer.score >= BEST_FIT_MIN && offer.why)
    .slice(0, BEST_FIT_LIMIT)
  return { offers, hasProfile: feed.hasProfile }
}

/** The For-you scoring for one offer, for the drawer. Null when the offer does not exist. */
export async function scoreOfferForUser(
  jobId: string,
  userId: number | null,
  locale: "pl" | "en"
): Promise<{
  view: FeedOffer
  score: FeedScore
  hasProfile: boolean
  hasFeedback: boolean
} | null> {
  await ensureFxRates()
  const [row, profile, model] = await Promise.all([
    db.job.findUnique({ where: { id: jobId }, select: jobSelect }),
    userId ? db.candidateProfile.findUnique({ where: { userId } }) : null,
    userId ? buildPreferenceModel(userId) : null,
  ])
  if (!row) return null
  const hasProfile = Boolean(profile && profileUseful(profile))
  const hasFeedback = Boolean(model && model.liked + model.disliked > 0)
  const result = scoreRow(row, {
    signals: hasProfile && profile ? toSignals(profile, locale) : null,
    profile: hasProfile ? profile : null,
    model: hasFeedback ? model : null,
    locale,
    now: new Date(),
  })
  return { ...result, hasProfile, hasFeedback }
}

export async function jobsPathForSavedSearch(
  id: string,
  userId: number | null,
  extra: BrowseInput = {}
): Promise<string> {
  const search = userId
    ? await db.savedSearch.findFirst({
        where: { id, userId },
        select: { phrase: true, locationHint: true, workMode: true },
      })
    : null
  return browseQuery(
    resolveBrowse({
      phrase: extra.phrase || extra.q || search?.phrase,
      location: extra.location || search?.locationHint || "",
      mode: extra.mode || search?.workMode,
      pay: extra.pay,
      where: extra.where,
      city: extra.city,
    })
  )
}

/** Open offers, in one country (and remote ones open to it) when given. */
export async function countOpenOffers(
  country: string | null = null,
  { remoteHere = false } = {}
): Promise<number> {
  const open = { status: { in: ["ACTIVE" as const, "POSSIBLY_CLOSED" as const] } }
  if (!country) return db.job.count({ where: open })
  if (isBlockedCountry(country)) return 0
  // An offer stored with the country is in it (placeInCountry), so the GIN index counts those;
  // only the rest, the remote candidates, need the location test.
  const stored = { countries: { has: country } }
  const [inCountry, rest] = await Promise.all([
    db.job.count({ where: { ...open, ...stored } }),
    db.job.findMany({
      where: { ...open, AND: [inCountryWhere(country), { NOT: stored }] },
      select: {
        locationText: true,
        countryCode: true,
        countries: true,
        remoteRegions: true,
        workplaceType: true,
      },
    }),
  ])
  return (
    inCountry +
    rest.filter((row) => placeInCountry(placeFacts(row), country, { remoteHere })).length
  )
}

/** The most common cities among the newest offers, in one country when given. */
export async function listBrowseCities(
  country: string | null = null
): Promise<{ city: string; count: number }[]> {
  const rows = await db.job.findMany({
    where: {
      status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] },
      ...(country ? inCountryWhere(country, { remote: false }) : {}),
    },
    select: {
      locationText: true,
      countryCode: true,
      countries: true,
      remoteRegions: true,
      workplaceType: true,
    },
    orderBy: { lastSeenAt: "desc" },
    take: CITY_SCAN,
  })
  const inCountry = country
    ? rows.filter((row) => {
        const place = placeFacts(row)
        return (
          place.countries.includes(country) && (!place.city || cityCountry(place.city) === country)
        )
      })
    : rows
  return citiesFrom(inCountry).slice(0, 12)
}

/** Countries with open offers, most offers first, counted over the newest offers. */
/**
 * Every country with open offers and how many. Every write stores the countries, so this counts
 * the whole index; a scan of the newest 5,000 rows showed the US at 1,375 of its 64,710 offers.
 */
export async function listBrowseCountries(): Promise<{ country: string; count: number }[]> {
  const rows = await db.$queryRaw<{ country: string; count: bigint }[]>`
    SELECT c AS country, COUNT(*) AS count
    FROM "Job", unnest(countries) AS c
    WHERE status IN ('ACTIVE', 'POSSIBLY_CLOSED')
    GROUP BY c`
  return rows
    .filter((row) => !isBlockedCountry(row.country))
    .map((row) => ({ country: row.country, count: Number(row.count) }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
}
