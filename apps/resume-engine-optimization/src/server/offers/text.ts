import "src/server/fetch/ats"
import db from "db"
import { pageText, readOfferSource, type LiveText } from "@newrole/ats/read"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { stripPersonalData } from "@newrole/offers/hygiene"
import { OFFER_TEXT_LIMIT, type OfferTextOrigin } from "@newrole/cv-core/tailor"
import type { SourceType } from "@newrole/ats/schemas"

/**
 * The whole text of one offer for a model or a screen. A person's own copy (UserOffer, kept when
 * they added the offer by its link) comes first; otherwise the source is read again when they ask
 * for something that needs it (@newrole/ats/read), and Job's excerpt is the fallback. A site that
 * opts out of AI use gives a model nothing.
 */

export { OFFER_TEXT_LIMIT, pageText }

const LIVE_TIMEOUT_MS = 25_000
const READ_TTL_MS = 15 * 60_000
const MISS_TTL_MS = 2 * 60_000
const CACHE_SIZE = 100

export type OfferText = { text: string; origin: OfferTextOrigin }

export type OfferSource = {
  id: string
  title: string
  company: string
  originalUrl: string
  sourceType: SourceType
  sourceBoardId: string | null
  externalId: string | null
  llmOptOut: boolean
  /** What the index holds. Empty when it has only the title. */
  stored: string
}

export const offerSourceSelect = {
  id: true,
  title: true,
  summary: true,
  descriptionText: true,
  originalUrl: true,
  sourceType: true,
  sourceBoardId: true,
  externalId: true,
  llmOptOut: true,
  company: { select: { name: true } },
} as const

type OfferSourceRow = {
  id: string
  title: string
  summary: string
  descriptionText: string
  originalUrl: string
  sourceType: string
  sourceBoardId: string | null
  externalId: string | null
  llmOptOut: boolean
  company: { name: string }
}

export function toOfferSource(row: OfferSourceRow): OfferSource {
  const summary = row.summary.trim()
  // an offer listed without text gets its title as the summary
  const stored = row.descriptionText.trim() || (summary === row.title.trim() ? "" : summary)
  return {
    id: row.id,
    title: row.title,
    company: row.company.name,
    originalUrl: row.originalUrl,
    sourceType: row.sourceType as SourceType,
    sourceBoardId: row.sourceBoardId,
    externalId: row.externalId,
    llmOptOut: row.llmOptOut,
    stored,
  }
}

/** What the index alone can give: enough to draw a page without a network call. */
export function indexedOfferText(source: OfferSource): OfferText {
  if (source.llmOptOut) return { text: "", origin: "withheld" }
  return source.stored ? { text: source.stored, origin: "excerpt" } : { text: "", origin: "none" }
}

type Live = LiveText

function readLive(source: OfferSource, http: HttpClient): Promise<Live> {
  return readOfferSource(
    {
      title: source.title,
      company: source.company,
      originalUrl: source.originalUrl,
      sourceType: source.sourceType,
      sourceBoardId: source.sourceBoardId,
      externalId: source.externalId,
    },
    http
  )
}

function withinTime<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms)
  })
  return Promise.race([work, late]).finally(() => clearTimeout(timer))
}

async function readFresh(source: OfferSource, http: HttpClient): Promise<OfferText> {
  let live: Live = null
  try {
    live = await withinTime(readLive(source, http), LIVE_TIMEOUT_MS)
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error"
    console.warn(`[offer-text] ${source.sourceType} offer ${source.id}: ${reason}`)
  }
  if (live?.withheld) return { text: "", origin: "withheld" }
  const text = stripPersonalData(live?.text ?? "").slice(0, OFFER_TEXT_LIMIT)
  return text ? { text, origin: "full" } : indexedOfferText(source)
}

const reads = new Map<string, { until: number; value: Promise<OfferText> }>()

/**
 * Never throws and never writes: when the source cannot be read, the excerpt from the index is
 * returned and `origin` says so. The start page and the model share one read through this cache.
 */
export function readOfferText(
  source: OfferSource,
  http: HttpClient = createHttpClient()
): Promise<OfferText> {
  if (source.llmOptOut) return Promise.resolve({ text: "", origin: "withheld" })
  const known = reads.get(source.id)
  if (known && known.until > Date.now()) return known.value
  const value = readFresh(source, http)
  const entry = { until: Date.now() + READ_TTL_MS, value }
  reads.delete(source.id)
  reads.set(source.id, entry)
  if (reads.size > CACHE_SIZE) reads.delete(reads.keys().next().value as string)
  void value.then((read) => {
    if (read.origin !== "full") entry.until = Date.now() + MISS_TTL_MS
  })
  return value
}

export async function readOfferTextById(
  jobId: string,
  http?: HttpClient
): Promise<OfferText | null> {
  const row = await db.job.findUnique({ where: { id: jobId }, select: offerSourceSelect })
  return row ? readOfferText(toOfferSource(row), http) : null
}

/** The person's own copy of the offer, when they keep one (UserOffer). */
export async function savedOfferText(userId: number, jobId: string): Promise<OfferText | null> {
  const row = await db.userOffer.findUnique({
    where: { userId_jobId: { userId, jobId } },
    select: { text: true, job: { select: { llmOptOut: true } } },
  })
  if (!row?.text?.trim()) return null
  if (row.job.llmOptOut) return { text: "", origin: "withheld" }
  return { text: row.text.slice(0, OFFER_TEXT_LIMIT), origin: "full" }
}

/** For one person: their own copy first, then the source, then the excerpt. */
export async function offerTextFor(
  userId: number | null,
  jobId: string,
  http?: HttpClient
): Promise<OfferText | null> {
  const saved = userId ? await savedOfferText(userId, jobId) : null
  return saved ?? readOfferTextById(jobId, http)
}
