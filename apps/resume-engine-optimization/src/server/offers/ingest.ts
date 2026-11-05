import "src/server/fetch/ats"
import db from "db"
import { hostOf } from "@newrole/ats/careers-detect"
import { safeCanonicalUrl } from "@newrole/ats/dedupe"
import type { HttpClient } from "@newrole/ats/host"
import { normalizeCompanyName } from "@newrole/ats/normalize"
import { payloadToJob, type OfferPayload } from "@newrole/ats/payload"
import { readOfferUrl } from "@newrole/ats/read"
import type { ListedJob } from "@newrole/ats/schemas"
import { stripPersonalData } from "@newrole/offers/hygiene"
import { OFFER_TEXT_LIMIT } from "@newrole/cv-core/tailor"
import { storeOffer } from "./store"

/**
 * One offer from its link into newrole.it: @newrole/ats reads it (the ATS's API, or the page's
 * JobPosting), store.ts keeps it. The whole text read comes back with it, for the person's own copy
 * of the offer; Job keeps 300 characters of it.
 */

export type IngestUrlResult = {
  status: "created" | "updated" | "link-only" | "rejected"
  jobId?: string
  message: string
  /** The posting's whole text as read, personal data removed; empty when it had none */
  text?: string
  /** The site opts out of AI use: the text is not given to a model */
  withheld?: boolean
  /** A page that was read but holds no JobPosting. Not stored. */
  page?: { url: string; html: string }
}

export type IngestDeps = {
  http?: HttpClient
  now?: Date
  takeSlot?: (host: string) => Promise<boolean>
  save?: (job: ListedJob, now: Date) => Promise<{ id: string; created: boolean }>
}

function slugName(boardId: string): string {
  const base = boardId.replace(/^eu:/, "").split(".")[0] ?? boardId
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

function fullText(job: ListedJob): string {
  return stripPersonalData(job.descriptionText ?? "").slice(0, OFFER_TEXT_LIMIT)
}

/** It must be that very offer: a page without JSON-LD comes back for the caller to read. */
export async function ingestOfferUrl(url: string, deps: IngestDeps = {}): Promise<IngestUrlResult> {
  const now = deps.now ?? new Date()
  const save = deps.save ?? storeOffer
  const read = await readOfferUrl(url, { exact: true, http: deps.http, takeSlot: deps.takeSlot })
  if (read.status === "page") return { status: "rejected", message: read.message, page: read.page }
  if (read.status !== "listed") return { status: read.status, message: read.message }
  const job = read.job
  let stored: ListedJob
  if (read.from === "ats" && read.provider) {
    const boardId = job.sourceBoardId ?? ""
    const page = await db.careerPage.findUnique({
      where: { provider_providerBoardId: { provider: read.provider, providerBoardId: boardId } },
      select: { company: { select: { name: true } } },
    })
    const companyName =
      job.companyName || read.boardCompany || page?.company.name || slugName(boardId)
    stored = { ...job, companyName, sourceBoardId: boardId }
  } else {
    const host = new URL(job.originalUrl || url).hostname.toLowerCase().replace(/^www\./, "")
    const companyName = job.companyName || hostOf(url) || "Company"
    stored = {
      ...job,
      companyName,
      sourceBoardId: `page:${host}:${normalizeCompanyName(companyName)}`.slice(0, 180),
    }
  }
  const saved = await save(stored, now)
  return {
    status: saved.created ? "created" : "updated",
    jobId: saved.id,
    message: `${job.title} at ${stored.companyName}, read from ${
      read.provider ? read.provider.toLowerCase() : "the company page"
    }.`,
    text: job.llmOptOut ? "" : fullText(job),
    withheld: Boolean(job.llmOptOut),
  }
}

export type IngestPayloadResult = {
  status: "created" | "updated" | "rejected"
  jobId?: string
  message: string
  text?: string
}

/**
 * An offer the person checked, or one Claude read itself over MCP. A posting the index of another
 * app already read from the company's own source is kept as that version.
 */
export async function ingestOfferPayload(
  input: OfferPayload,
  deps: Pick<IngestDeps, "now" | "save"> = {}
): Promise<IngestPayloadResult> {
  const result = payloadToJob(input)
  if ("error" in result) return { status: "rejected", message: result.error }
  const canonical = safeCanonicalUrl(result.job.originalUrl)
  const crawled = await db.job.findFirst({
    where: {
      canonicalUrl: canonical,
      status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] },
      sourceType: { not: "WEB_SEARCH" },
    },
    select: { id: true },
  })
  const text = result.linkOnly ? "" : fullText(result.job)
  if (crawled) {
    return {
      status: "updated",
      jobId: crawled.id,
      message: "Already known from the company's own source. Kept that version.",
      text,
    }
  }
  const saved = await (deps.save ?? storeOffer)(result.job, deps.now ?? new Date())
  return {
    status: saved.created ? "created" : "updated",
    jobId: saved.id,
    message: result.linkOnly
      ? `${result.job.title} at ${result.job.companyName}: stored as title and link only.`
      : `${result.job.title} at ${result.job.companyName} stored.`,
    text,
  }
}
