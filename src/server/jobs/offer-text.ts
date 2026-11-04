import db from "db"
import { detailPagesAllowed } from "src/server/adapters/career-site"
import { hydrateAvature } from "src/server/adapters/avature"
import { hydrateBamboo } from "src/server/adapters/bamboohr"
import { hydrateErecruiter } from "src/server/adapters/erecruiter"
import { hydrateGreenhouse } from "src/server/adapters/greenhouse"
import { hydrateJobvite } from "src/server/adapters/jobvite"
import { hydratePhenom } from "src/server/adapters/phenom"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { adapterFor, type LiveAts } from "src/server/adapters/registry"
import { hydrateSmartRecruiters } from "src/server/adapters/smartrecruiters"
import { parseSuccessFactorsJob } from "src/server/adapters/successfactors"
import { takeDetailSlot } from "src/server/crawler/budget"
import { aiOptOut, stripPersonalData } from "src/server/crawler/hygiene"
import { createRobotsCache, policyFor, politeGet } from "@newrole/offers/polite"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { OFFER_TEXT_LIMIT, type OfferTextOrigin } from "@newrole/cv-core/tailor"
import type { ListedJob, SourceType } from "src/shared/schemas"

/**
 * The whole text of one offer, read from its source when a person asks for something that needs it.
 * The index keeps EXCERPT_CHARS at most, so this text stays in memory and is never written to a
 * table. docs/product/plan-p0.md has the reasons.
 */

export { OFFER_TEXT_LIMIT }

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

type Live = { text: string; withheld: boolean } | null

type Hydrate = (job: ListedJob, http: HttpClient) => Promise<ListedJob>

/** One request for one offer. */
const DETAIL_APIS: Partial<Record<SourceType, Hydrate>> = {
  GREENHOUSE: hydrateGreenhouse,
  SMARTRECRUITERS: hydrateSmartRecruiters,
  BAMBOOHR: hydrateBamboo,
  ERECRUITER: hydrateErecruiter,
  PHENOM: hydratePhenom,
  AVATURE: hydrateAvature,
  JOBVITE: hydrateJobvite,
}

/** These feeds carry every description in the list, and the crawler reads them the same way. */
const LISTED_WITH_TEXT = new Set<SourceType>([
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "TRAFFIT",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "PINPOINT",
])

function asLive(job: ListedJob | undefined): Live {
  if (!job) return null
  return { text: job.descriptionText ?? "", withheld: Boolean(job.llmOptOut) }
}

async function readDetailApi(
  source: OfferSource,
  hydrate: Hydrate,
  http: HttpClient
): Promise<Live> {
  const job = await hydrate(
    {
      externalId: source.externalId ?? undefined,
      title: source.title,
      companyName: source.company,
      workplaceType: "UNKNOWN",
      originalUrl: source.originalUrl,
      sourceType: source.sourceType,
      sourceBoardId: source.sourceBoardId ?? undefined,
      needsHydration: true,
    },
    http
  )
  return asLive(job)
}

async function readFromList(source: OfferSource, http: HttpClient): Promise<Live> {
  if (!source.sourceBoardId) return null
  const adapter = adapterFor(source.sourceType as LiveAts)
  const { jobs } = await adapter.list(source.sourceBoardId, http, source.company)
  const found =
    jobs.find((job) => source.externalId && job.externalId === source.externalId) ??
    jobs.find((job) => job.originalUrl === source.originalUrl)
  return asLive(found)
}

/** A company's own page: source policy, robots.txt and the daily cap, like the crawler. */
async function readPage(source: OfferSource, http: HttpClient): Promise<Live> {
  const policy = policyFor(source.originalUrl)
  if (!policy.allow) return null
  const { hostname } = new URL(source.originalUrl)
  if (!detailPagesAllowed(hostname)) return null
  if (!(await takeDetailSlot(hostname))) return null
  const page = await politeGet(source.originalUrl, http, createRobotsCache())
  if (!page.ok) return null
  const body = page.response.body
  const url = page.response.url || source.originalUrl
  const board = source.sourceBoardId ?? undefined
  const job =
    source.sourceType === "SUCCESSFACTORS"
      ? parseSuccessFactorsJob(body, url, source.company, board, { fullText: true }) ?? undefined
      : parseJsonLdJobs(body, url, source.company, {
          sourceType: source.sourceType,
          boardId: board,
          fullText: true,
        })[0]
  return job ? asLive(job) : { text: "", withheld: aiOptOut(body, hostname) }
}

function readLive(source: OfferSource, http: HttpClient): Promise<Live> {
  const detailApi = DETAIL_APIS[source.sourceType]
  if (detailApi) return readDetailApi(source, detailApi, http)
  if (LISTED_WITH_TEXT.has(source.sourceType)) return readFromList(source, http)
  return readPage(source, http)
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
