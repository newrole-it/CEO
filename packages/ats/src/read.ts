import { isPolishBoardHost } from "@newrole/offers/polish-boards"
import { aiOptOut, stripPersonalData } from "@newrole/offers/hygiene"
import { createRobotsCache, policyFor, politeGet, type RobotsCache } from "@newrole/offers/polite"
import { htmlToText } from "@newrole/offers/text"
import { assertSafeUrl } from "@newrole/offers/url-safety"
import { hydrateAvature } from "./adapters/avature"
import { hydrateBamboo } from "./adapters/bamboohr"
import { detailPagesAllowed } from "./adapters/career-site"
import { hydrateErecruiter } from "./adapters/erecruiter"
import { hydrateGreenhouse } from "./adapters/greenhouse"
import { hydrateJobvite } from "./adapters/jobvite"
import { parseJsonLdJobs } from "./adapters/jsonld"
import { hydratePhenom } from "./adapters/phenom"
import { adapterFor, type LiveAts } from "./adapters/registry"
import { hydrateSmartRecruiters } from "./adapters/smartrecruiters"
import { parseSuccessFactorsJob } from "./adapters/successfactors"
import { classifyHit, workableSlugFromHtml } from "./boards"
import { isAggregatorHost } from "./careers-detect"
import { safeCanonicalUrl } from "./dedupe"
import { createHttpClient, takeDetailSlot, type HttpClient } from "./host"
import type { ListedJob, SourceType } from "./schemas"

/**
 * One offer from its link, and the whole text of an offer already known, read the way the crawler
 * reads boards: an ATS link through the board's API, another page through its schema.org
 * JobPosting, under the source policy, robots.txt, the per-host pace and the daily cap of detail
 * pages. Nothing is stored here; the app keeps what it needs.
 */

/** LinkedIn and social sites are refused outright; Polish job boards stay link-only. */
export function refusedHost(host: string): string | null {
  if (isPolishBoardHost(host)) return null
  if (isAggregatorHost(host)) return "LinkedIn and social sites are never read or stored."
  return null
}

/**
 * Pick the posting a URL points at: same canonical URL, an id in the path, or the only one.
 * `exact` skips the last guess, which is wrong for a closed offer on a board with one other job.
 */
export function matchPosting(jobs: ListedJob[], url: string, exact = false): ListedJob | null {
  const target = safeCanonicalUrl(url)
  const byUrl = jobs.find((job) => safeCanonicalUrl(job.originalUrl) === target)
  if (byUrl) return byUrl
  const path = (() => {
    try {
      return new URL(url).pathname.toLowerCase()
    } catch {
      return ""
    }
  })()
  const byId = jobs.find((job) => {
    const id = job.externalId?.split(":").pop()?.toLowerCase()
    return Boolean(id && id.length >= 4 && path.includes(id))
  })
  if (byId) return byId
  return !exact && jobs.length === 1 ? jobs[0]! : null
}

export type OfferUrlRead =
  /** The posting itself, from the ATS's API (`provider`) or the page's JSON-LD. */
  | {
      status: "listed"
      job: ListedJob
      from: "ats" | "jsonld"
      provider?: LiveAts
      /** The board's company name when the posting has none of its own */
      boardCompany?: string
      message: string
    }
  /** A page that was read but holds no JobPosting: the caller may read its text another way. */
  | { status: "page"; page: { url: string; html: string }; message: string }
  | { status: "link-only" | "rejected"; message: string }

export type ReadDeps = {
  http?: HttpClient
  robots?: RobotsCache
  takeSlot?: (host: string) => Promise<boolean>
}

async function fromAts(
  url: string,
  provider: LiveAts,
  boardId: string,
  http: HttpClient,
  exact: boolean
): Promise<OfferUrlRead> {
  const adapter = adapterFor(provider)
  let listed
  try {
    listed = await adapter.list(boardId, http)
  } catch (error) {
    return {
      status: "rejected",
      message: `The ${provider.toLowerCase()} board did not answer: ${
        error instanceof Error ? error.message : "error"
      }`,
    }
  }
  let job = matchPosting(listed.jobs, url, exact)
  if (!job) {
    return {
      status: "rejected",
      message: listed.jobs.length
        ? "That offer is no longer on the company's board."
        : listed.note || "The board has no open offers.",
    }
  }
  if (job.needsHydration && adapter.hydrate) {
    try {
      job = await adapter.hydrate(job, http)
    } catch {
      /* keep the list row */
    }
  }
  return {
    status: "listed",
    job: { ...job, sourceBoardId: job.sourceBoardId || boardId },
    from: "ats",
    provider,
    boardCompany: listed.companyName,
    message: `${job.title}, read from ${provider.toLowerCase()}.`,
  }
}

/**
 * Read one posting URL. ATS links use the board API; other pages need JSON-LD JobPosting data.
 * `exact`: it must be that very offer (a link someone applied through, or added by hand); a page
 * without JSON-LD then comes back so the caller can read it another way.
 */
export async function readOfferUrl(
  rawUrl: string,
  opts: { exact?: boolean } & ReadDeps = {}
): Promise<OfferUrlRead> {
  const exact = opts.exact === true
  const http = opts.http ?? createHttpClient()
  let url: URL
  try {
    url = assertSafeUrl(rawUrl.trim())
  } catch (error) {
    return { status: "rejected", message: error instanceof Error ? error.message : "Invalid URL" }
  }
  const host = url.hostname.toLowerCase()
  const refused = refusedHost(host)
  if (refused) return { status: "rejected", message: refused }
  if (isPolishBoardHost(host)) {
    return { status: "link-only", message: "Job boards are never fetched." }
  }
  const hit = classifyHit(url.toString())
  if (hit.kind === "workday" || hit.kind === "unverified-ats") {
    return { status: "link-only", message: "This ATS is read as a link only." }
  }
  const robots = opts.robots ?? createRobotsCache()
  if (hit.kind === "ats") {
    return fromAts(url.toString(), hit.provider as LiveAts, hit.boardId, http, exact)
  }
  if (hit.kind === "workable-shortcode") {
    const page = await politeGet(url.toString(), http, robots)
    const slug = page.ok ? workableSlugFromHtml(page.response.body) : null
    if (!slug) return { status: "rejected", message: "The Workable account could not be read." }
    return fromAts(url.toString(), "WORKABLE", slug, http, exact)
  }
  const policy = policyFor(url.toString())
  if (!policy.allow) {
    return { status: policy.linkOnly ? "link-only" : "rejected", message: policy.reason }
  }
  const take = opts.takeSlot ?? takeDetailSlot
  if (!(await take(host))) {
    return { status: "rejected", message: `Daily page cap for ${host} is used up. Try tomorrow.` }
  }
  const page = await politeGet(url.toString(), http, robots)
  if (!page.ok) return { status: page.linkOnly ? "link-only" : "rejected", message: page.reason }
  const reached = page.response.url || url.toString()
  // the whole description: whoever stores it decides how much to keep
  const jobs = parseJsonLdJobs(page.response.body, reached, undefined, { fullText: true })
  const job = matchPosting(jobs, reached)
  if (!job) {
    return exact
      ? {
          status: "page",
          page: { url: reached, html: page.response.body },
          message: "No schema.org JobPosting on that page.",
        }
      : {
          status: "rejected",
          message:
            "No schema.org JobPosting on that page. If you read it yourself, send it as a payload.",
        }
  }
  return { status: "listed", job, from: "jsonld", message: `${job.title}, read from the page.` }
}

// ---------------------------------------------------------------- full text

/** Less than this from a page without structured data is a menu or a cookie banner, not an offer. */
const PAGE_TEXT_MIN = 400

/** What reading an offer's source gave: its text, or that the site opts out of AI use. */
export type LiveText = { text: string; withheld: boolean } | null

/** An offer as an app knows it, enough to read it again from its source. */
export type OfferSource = {
  title: string
  company: string
  originalUrl: string
  sourceType: SourceType
  sourceBoardId: string | null
  externalId: string | null
}

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

function asLive(job: ListedJob | undefined): LiveText {
  if (!job) return null
  return { text: job.descriptionText ?? "", withheld: Boolean(job.llmOptOut) }
}

async function readDetailApi(source: OfferSource, hydrate: Hydrate, http: HttpClient) {
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

async function readFromList(source: OfferSource, http: HttpClient): Promise<LiveText> {
  if (!source.sourceBoardId) return null
  const adapter = adapterFor(source.sourceType as LiveAts)
  const { jobs } = await adapter.list(source.sourceBoardId, http, source.company)
  const found =
    jobs.find((job) => source.externalId && job.externalId === source.externalId) ??
    jobs.find((job) => job.originalUrl === source.originalUrl)
  return asLive(found)
}

/** A page without JobPosting data: the text of its main part, without menus and footers. */
export function pageText(html: string): string {
  const main =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    html
  const content = main.replace(
    /<(nav|header|footer|aside|form|noscript|svg|template)\b[\s\S]*?<\/\1>/gi,
    " "
  )
  const text = htmlToText(content)
  return text.length >= PAGE_TEXT_MIN ? text : ""
}

/** A company's own page: source policy, robots.txt and the daily cap, like the crawler. */
async function readPage(source: OfferSource, http: HttpClient): Promise<LiveText> {
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
  if (job) return asLive(job)
  if (aiOptOut(body, hostname)) return { text: "", withheld: true }
  return { text: pageText(body), withheld: false }
}

/**
 * The whole text of a known offer from its source: the ATS's detail API, its list where the list
 * carries the text, or the page. Null when nothing could be read. Personal data is removed.
 */
export async function readOfferSource(
  source: OfferSource,
  http: HttpClient = createHttpClient()
): Promise<LiveText> {
  const detailApi = DETAIL_APIS[source.sourceType]
  const live = detailApi
    ? await readDetailApi(source, detailApi, http)
    : LISTED_WITH_TEXT.has(source.sourceType)
    ? await readFromList(source, http)
    : await readPage(source, http)
  return live ? { ...live, text: stripPersonalData(live.text) } : null
}
