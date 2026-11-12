import {
  boardUrlFacts,
  extractJobByModel,
  extractJobByRules,
  finishJob,
  GENERIC_TITLE,
  mergeFacts,
  normalizePostingUrl,
  postingUrlCandidates,
  type ModelFacts,
  type PageInput,
} from "src/server/autofill/job-extract"
import { createHttpClient, takeDetailSlot } from "@newrole/ats/host"
import { isAggregatorHost } from "@newrole/offers/hosts"
import { aiOptOut, stripPersonalData } from "@newrole/offers/hygiene"
import { ingestOfferUrl, type IngestUrlResult } from "src/server/offers/ingest"
import { policyFor } from "@newrole/offers/polite"
import { readPosting, type PostingResult } from "@newrole/offers/posting"
import { decodeEntities, htmlToText } from "@newrole/offers/text"
import { pageText } from "src/server/offers/text"
import { formatSalary, urlKey } from "./logic"
import { findJobById, findJobByUrl, type IndexedJob } from "./service"
import type { OfferFacts, OfferOutcome } from "./types"

/**
 * "Dodaj ofertę" by link: what we can say about a posting from its URL. The
 * offers already known first, then the ingest path (ATS API or JSON-LD, which also stores the
 * offer, src/server/offers/ingest.ts), then the text of the page it read. A job board's or
 * LinkedIn's offer is read once for the person, for its company, role and place. Other hosts under
 * a link-only policy are never fetched: only what their URL spells out comes back, marked for
 * checking. Page HTML is not stored.
 */

export type OfferReading = {
  /** The posting to store: an /apply page or an embed becomes the offer itself. */
  url: string
  outcome: OfferOutcome
  facts: OfferFacts | null
  /** Why it was not read, in English, for MCP. */
  note?: string
  /** The posting's whole text as it was read just now, personal data removed (not from the index) */
  text?: string
  /** The site opts out of AI use */
  withheld?: boolean
}

export type ReadOfferDeps = {
  findByUrl?: (url: string) => Promise<IndexedJob | null>
  findById?: (id: string) => Promise<IndexedJob | null>
  ingest?: (url: string) => Promise<IngestUrlResult>
  model?: (page: PageInput) => Promise<ModelFacts | null>
  /** A job board's or LinkedIn's page, read for the person */
  board?: (url: string) => Promise<PostingResult>
}

function factsOf(job: IndexedJob): OfferFacts {
  return {
    jobId: job.id,
    company: job.company.name,
    title: job.title,
    location: job.locationText,
    salaryText: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
  }
}

function metaContent(html: string, property: string): string | null {
  const value =
    html.match(
      new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, "i")
    )?.[1] ||
    html.match(
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, "i")
    )?.[1]
  return value ? decodeEntities(value).trim() : null
}

/**
 * The main part of the page first: on Google Careers the first 4,000 characters of the whole
 * page are menus and twenty other offers, and the place comes after them (read 2026-11-04).
 */
function pageInput(url: string, html: string): PageInput {
  const tag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  return {
    url,
    title: metaContent(html, "og:title") ?? (tag ? decodeEntities(tag).trim() : null),
    siteName: metaContent(html, "og:site_name"),
    text: stripPersonalData(pageText(html) || htmlToText(html)),
  }
}

/** The link ended on another site's sign-in page, so what was read is not the offer. */
export function signInPage(requested: string, reached: string): boolean {
  try {
    const from = new URL(requested).hostname.toLowerCase()
    const to = new URL(reached)
    if (to.hostname.toLowerCase() === from) return false
    return (
      /^(accounts|login|signin|auth|sso)\./i.test(to.hostname) ||
      /\/(sign-?in|log-?in|auth|sso)\b/i.test(to.pathname)
    )
  } catch {
    return false
  }
}

/** A page with no structured data. The model reads it unless the page opts out of AI use. */
async function readPage(
  url: string,
  page: { url: string; html: string },
  deps: ReadOfferDeps
): Promise<OfferReading> {
  const input = pageInput(page.url, page.html)
  const optOut = aiOptOut(page.html, new URL(page.url).hostname)
  const model = optOut ? null : await (deps.model ?? extractJobByModel)(input)
  const rules = extractJobByRules(input)
  const job = finishJob(input, model ? mergeFacts(model, rules) : rules)
  const text = optOut ? "" : stripPersonalData(pageText(page.html))
  if (!job) return { url, outcome: "unreadable", facts: null, text, withheld: optOut }
  return {
    url,
    text,
    withheld: optOut,
    outcome: model?.company && model.title ? "read" : "partial",
    facts: {
      jobId: null,
      company: job.company,
      title: GENERIC_TITLE.test(job.title) ? null : job.title,
      location: job.location,
      salaryText: model?.salaryText ?? null,
    },
  }
}

/** No fetch: what the link itself says, from an ATS slug or a job board's URL. */
function readLink(url: string, result: IngestUrlResult): OfferReading {
  const rules = extractJobByRules({ url })
  const board = boardUrlFacts(url)
  const company = board.company ?? rules.company
  const title = board.title ?? rules.title
  const location = board.location ?? rules.location
  return {
    url,
    outcome: result.status === "link-only" || !policyFor(url).allow ? "link-only" : "unreadable",
    facts:
      company || title || location
        ? { jobId: null, company, title, location, salaryText: null }
        : null,
    note: result.message,
  }
}

function onBoard(url: string): boolean {
  try {
    return isAggregatorHost(new URL(url).hostname)
  } catch {
    return false
  }
}

/** A JobPosting without its employer: readPosting then gives the site's own name. */
function boardsOwnName(company: string, pageUrl: string): boolean {
  const fold = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase()
  const key = fold(company)
  return key.length < 3 || fold(new URL(pageUrl).hostname).includes(key)
}

/** A person's read of one page, under the daily cap of detail pages. */
async function readBoardPosting(url: string): Promise<PostingResult> {
  if (!(await takeDetailSlot(new URL(url).hostname))) {
    return { ok: false, reason: "The daily page cap for this site is used up.", linkOnly: false }
  }
  return readPosting(url, createHttpClient())
}

/**
 * A job board's or LinkedIn's offer, read once for the person who gave its link (a person's read
 * in @newrole/offers: robots.txt and the site owner's opt-out still apply): the company, role and
 * place its JobPosting names. Its text is not passed on, so it is not kept: it is read again when
 * they tailor (readOnlyWhenTailoring in src/server/offers/service.ts). Without a JobPosting, only
 * what the link says.
 */
async function readBoard(
  url: string,
  result: IngestUrlResult,
  deps: ReadOfferDeps
): Promise<OfferReading> {
  const link = readLink(url, result)
  const read = await (deps.board ?? readBoardPosting)(url)
  if (!read.ok) return { ...link, note: read.reason }
  const { posting } = read
  if (posting.source !== "jsonld" || signInPage(url, posting.url)) return link
  const company = boardsOwnName(posting.company, posting.url)
    ? (link.facts?.company ?? null)
    : posting.company
  const title = GENERIC_TITLE.test(posting.title) ? (link.facts?.title ?? null) : posting.title
  return {
    url,
    outcome: company && title ? "read" : "partial",
    facts: {
      jobId: null,
      company,
      title,
      location: posting.location ?? link.facts?.location ?? null,
      salaryText: null,
    },
  }
}

export async function readOffer(rawUrl: string, deps: ReadOfferDeps = {}): Promise<OfferReading> {
  const raw = rawUrl.trim()
  const url = normalizePostingUrl(raw)
  for (const candidate of postingUrlCandidates(raw)) {
    const job = await (deps.findByUrl ?? findJobByUrl)(candidate)
    if (job) return { url, outcome: "read", facts: factsOf(job) }
  }
  const ingest = deps.ingest ?? ((posting) => ingestOfferUrl(posting))
  const result = await ingest(url)
  if (result.jobId) {
    const job = await (deps.findById ?? findJobById)(result.jobId)
    if (job) {
      return {
        url,
        outcome: "read",
        facts: factsOf(job),
        text: result.text,
        withheld: result.withheld,
      }
    }
  }
  if (result.page && signInPage(url, result.page.url)) {
    return { ...readLink(url, result), outcome: "unreadable", note: "The link asks to sign in." }
  }
  if (result.page) return readPage(url, result.page, deps)
  if (result.status === "link-only" && onBoard(url)) return readBoard(url, result, deps)
  return readLink(url, result)
}
