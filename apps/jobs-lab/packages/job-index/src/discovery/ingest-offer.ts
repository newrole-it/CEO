/**
 * Add one offer by URL (we read it, policy-checked) or as a structured payload
 * Claude extracted itself over MCP. Both land in the normal store, so identity,
 * dedupe, and the closing cycle work as for crawled offers.
 */
import { z } from "zod"
import db from "../db"
import { matchPosting, readOfferUrl, refusedHost } from "@newrole/ats/read"
import { stripPersonalData } from "@newrole/offers/hygiene"
import { identityFor, saveDiscoveredJob } from "../index/store"
import { safeCanonicalUrl } from "@newrole/ats/dedupe"
import { normalizeCompanyName, normalizeWhitespace } from "@newrole/ats/normalize"
import { htmlToText } from "@newrole/offers/text"
import { offerIndexEnabled } from "../offer-index"
import type { HttpClient } from "@newrole/ats/host"
import type { ListedJob } from "@newrole/ats/schemas"
import { isPolishBoardHost } from "@newrole/offers/polish-boards"
import { hostOf } from "@newrole/ats/careers-detect"
import { policyFor, type RobotsCache } from "@newrole/offers/polite"

import { payloadToJob } from "@newrole/ats/payload"

// Callers of the index's ingest also pick a posting, refuse hosts and read payloads by the same rules.
export { matchPosting, refusedHost }
export { offerPayloadSchema, payloadToJob, type OfferPayload } from "@newrole/ats/payload"

const NO_INDEX = "This server keeps no index of offers."

export type IngestUrlResult = {
  status: "created" | "updated" | "link-only" | "rejected"
  jobId?: string
  message: string
  /** With `forTracker`: the page that was read but held no JobPosting. Not stored. */
  page?: { url: string; html: string }
}

export type IngestPayloadResult = {
  status: "created" | "updated" | "rejected"
  jobId?: string
  message: string
}

export type IngestDeps = {
  http?: HttpClient
  now?: Date
  robots?: RobotsCache
  takeSlot?: (host: string) => Promise<boolean>
  save?: (job: ListedJob, now: Date) => Promise<{ id: string }>
  existing?: (identityKey: string) => Promise<{ id: string } | null>
}

function slugName(boardId: string): string {
  const base = boardId.replace(/^eu:/, "").split(".")[0] ?? boardId
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

async function store(job: ListedJob, deps: IngestDeps, now: Date) {
  const key = identityFor(job)
  const lookup =
    deps.existing ??
    ((identityKey) => db.job.findUnique({ where: { identityKey }, select: { id: true } }))
  const before = await lookup(key)
  const saved = await (deps.save ?? saveDiscoveredJob)(job, now)
  return { id: saved.id, created: !before }
}

/**
 * Read one posting URL (@newrole/ats/read) and keep it in the index. `forTracker` is for a link
 * someone applied through: it must be that very offer, and a page without JSON-LD comes back so
 * the caller can read it another way.
 */
export async function ingestOfferUrl(
  input: { url: string; userId?: number; channel: "web" | "mcp"; forTracker?: boolean },
  deps: IngestDeps = {}
): Promise<IngestUrlResult> {
  if (!offerIndexEnabled()) return { status: "rejected", message: NO_INDEX }
  const now = deps.now ?? new Date()
  const read = await readOfferUrl(input.url, {
    exact: input.forTracker === true,
    http: deps.http,
    robots: deps.robots,
    takeSlot: deps.takeSlot,
  })
  if (read.status === "page") {
    return { status: "rejected", message: read.message, page: read.page }
  }
  if (read.status !== "listed") return { status: read.status, message: read.message }
  const job = read.job
  if (read.from === "ats" && read.provider) {
    const boardId = job.sourceBoardId ?? ""
    const page = await db.careerPage.findUnique({
      where: { provider_providerBoardId: { provider: read.provider, providerBoardId: boardId } },
      include: { company: { select: { name: true } } },
    })
    const companyName =
      job.companyName || read.boardCompany || page?.company.name || slugName(boardId)
    const saved = await store({ ...job, companyName, sourceBoardId: boardId }, deps, now)
    return {
      status: saved.created ? "created" : "updated",
      jobId: saved.id,
      message: `${job.title} at ${companyName}, read from ${read.provider.toLowerCase()}.`,
    }
  }
  const host = new URL(job.originalUrl || input.url).hostname.toLowerCase()
  const companyName = job.companyName || hostOf(input.url) || "Company"
  const saved = await store(
    {
      ...job,
      companyName,
      sourceBoardId: `page:${host.replace(/^www\./, "")}:${normalizeCompanyName(
        companyName
      )}`.slice(0, 180),
    },
    deps,
    now
  )
  return {
    status: saved.created ? "created" : "updated",
    jobId: saved.id,
    message: `${job.title} at ${companyName}, read from the company page.`,
  }
}

/**
 * A posting Claude read itself, or one the person added by hand. Validated, recruiter contacts
 * stripped, stored as WEB_SEARCH with an `mcp:` or `web:` board id. Job-board links keep title
 * and link only.
 */
export async function ingestOfferPayload(
  input: {
    url: string
    company: string
    title: string
    description?: string
    location?: string
    workplace?: "REMOTE" | "HYBRID" | "ONSITE"
    salaryMin?: number
    salaryMax?: number
    salaryCurrency?: string
    salaryText?: string
    channel: "mcp" | "web"
  },
  deps: IngestDeps = {}
): Promise<IngestPayloadResult> {
  if (!offerIndexEnabled()) return { status: "rejected", message: NO_INDEX }
  const result = payloadToJob(input)
  if ("error" in result) return { status: "rejected", message: result.error }
  const now = deps.now ?? new Date()
  const canonical = safeCanonicalUrl(result.job.originalUrl)
  const crawled = await db.job.findFirst({
    where: {
      canonicalUrl: canonical,
      status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] },
      sourceType: { not: "WEB_SEARCH" },
    },
    select: { id: true },
  })
  if (crawled) {
    return {
      status: "updated",
      jobId: crawled.id,
      message: "Already indexed from the company's own source. Kept that version.",
    }
  }
  const saved = await store(result.job, deps, now)
  return {
    status: saved.created ? "created" : "updated",
    jobId: saved.id,
    message: result.linkOnly
      ? `${result.job.title} at ${result.job.companyName}: stored as title and link only.`
      : `${result.job.title} at ${result.job.companyName} stored.`,
  }
}
