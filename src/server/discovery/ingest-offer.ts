/**
 * Add one offer by URL (we read it, policy-checked) or as a structured payload
 * Claude extracted itself over MCP. Both land in the normal store, so identity,
 * dedupe, and the closing cycle work as for crawled offers.
 */
import { z } from "zod"
import db from "db"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { buildListedJob } from "src/server/adapters/parse"
import { adapterFor, type LiveAts } from "src/server/adapters/registry"
import { takeDetailSlot } from "src/server/crawler/budget"
import { stripPersonalData } from "src/server/crawler/hygiene"
import { identityFor, saveDiscoveredJob } from "src/server/index/store"
import { canonicalUrl } from "src/server/jobs/dedupe"
import { normalizeCompanyName, normalizeWhitespace } from "src/server/jobs/normalize"
import { htmlToText } from "src/server/jobs/text"
import { createHttpClient, type HttpClient } from "src/server/security/safe-fetch"
import { assertSafeUrl } from "src/server/security/url-safety"
import type { ListedJob } from "src/shared/schemas"
import { isPolishBoardHost } from "src/shared/polish-boards"
import { classifyHit, workableSlugFromHtml } from "./boards"
import { hostOf, isAggregatorHost } from "./careers-detect"
import { createRobotsCache, policyFor, politeGet, type RobotsCache } from "./polite-fetch"

export type IngestUrlResult = {
  status: "created" | "updated" | "link-only" | "rejected"
  jobId?: string
  message: string
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

/** LinkedIn and social sites are refused outright; Polish boards stay link-only. */
export function refusedHost(host: string): string | null {
  if (isPolishBoardHost(host)) return null
  if (isAggregatorHost(host)) return "LinkedIn and social sites are never read or stored."
  return null
}

function safeCanonical(raw: string): string {
  try {
    return canonicalUrl(raw)
  } catch {
    return raw
  }
}

function slugName(boardId: string): string {
  const base = boardId.replace(/^eu:/, "").split(".")[0] ?? boardId
  return base.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
}

async function store(job: ListedJob, deps: IngestDeps, now: Date) {
  const key = identityFor(job)
  const lookup = deps.existing ?? ((identityKey) => db.job.findUnique({ where: { identityKey }, select: { id: true } }))
  const before = await lookup(key)
  const saved = await (deps.save ?? saveDiscoveredJob)(job, now)
  return { id: saved.id, created: !before }
}

/** Pick the posting a URL points at: same canonical URL, an id in the path, or the only one. */
export function matchPosting(jobs: ListedJob[], url: string): ListedJob | null {
  const target = safeCanonical(url)
  const byUrl = jobs.find((job) => safeCanonical(job.originalUrl) === target)
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
  return jobs.length === 1 ? jobs[0]! : null
}

async function fromAts(
  url: string,
  provider: LiveAts,
  boardId: string,
  http: HttpClient,
  deps: IngestDeps,
  now: Date
): Promise<IngestUrlResult> {
  const adapter = adapterFor(provider)
  let listed
  try {
    listed = await adapter.list(boardId, http)
  } catch (error) {
    return { status: "rejected", message: `The ${provider.toLowerCase()} board did not answer: ${error instanceof Error ? error.message : "error"}` }
  }
  let job = matchPosting(listed.jobs, url)
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
  const page = await db.careerPage.findUnique({
    where: { provider_providerBoardId: { provider, providerBoardId: boardId } },
    include: { company: { select: { name: true } } },
  })
  const companyName = job.companyName || listed.companyName || page?.company.name || slugName(boardId)
  const saved = await store({ ...job, companyName, sourceBoardId: job.sourceBoardId || boardId }, deps, now)
  return {
    status: saved.created ? "created" : "updated",
    jobId: saved.id,
    message: `${job.title} at ${companyName}, read from ${provider.toLowerCase()}.`,
  }
}

/** Read one posting URL. ATS links use the board API; other pages need JSON-LD JobPosting data. */
export async function ingestOfferUrl(
  input: { url: string; userId?: number; channel: "web" | "mcp" },
  deps: IngestDeps = {}
): Promise<IngestUrlResult> {
  const now = deps.now ?? new Date()
  const http = deps.http ?? createHttpClient()
  let url: URL
  try {
    url = assertSafeUrl(input.url.trim())
  } catch (error) {
    return { status: "rejected", message: error instanceof Error ? error.message : "Invalid URL" }
  }
  const host = url.hostname.toLowerCase()
  const refused = refusedHost(host)
  if (refused) return { status: "rejected", message: refused }
  if (isPolishBoardHost(host)) {
    return {
      status: "link-only",
      message:
        "Job boards are never fetched. Send the title and company with ingestOfferPayload to keep it as a link.",
    }
  }
  const hit = classifyHit(url.toString())
  if (hit.kind === "workday" || hit.kind === "unverified-ats") {
    return { status: "link-only", message: "This ATS is read as a link only." }
  }
  const robots = deps.robots ?? createRobotsCache()
  if (hit.kind === "ats") {
    return fromAts(url.toString(), hit.provider as LiveAts, hit.boardId, http, deps, now)
  }
  if (hit.kind === "workable-shortcode") {
    const page = await politeGet(url.toString(), http, robots)
    const slug = page.ok ? workableSlugFromHtml(page.response.body) : null
    if (!slug) return { status: "rejected", message: "The Workable account could not be read." }
    return fromAts(url.toString(), "WORKABLE", slug, http, deps, now)
  }
  const policy = policyFor(url.toString())
  if (!policy.allow) {
    return { status: policy.linkOnly ? "link-only" : "rejected", message: policy.reason }
  }
  const take = deps.takeSlot ?? takeDetailSlot
  if (!(await take(host))) {
    return { status: "rejected", message: `Daily page cap for ${host} is used up. Try tomorrow.` }
  }
  const page = await politeGet(url.toString(), http, robots)
  if (!page.ok) return { status: page.linkOnly ? "link-only" : "rejected", message: page.reason }
  const jobs = parseJsonLdJobs(page.response.body, page.response.url || url.toString())
  const job = matchPosting(jobs, page.response.url || url.toString())
  if (!job) {
    return {
      status: "rejected",
      message:
        "No schema.org JobPosting on that page. If you read it yourself, send it with ingestOfferPayload.",
    }
  }
  const companyName = job.companyName || hostOf(url.toString()) || "Company"
  const saved = await store(
    {
      ...job,
      companyName,
      sourceBoardId: `page:${host.replace(/^www\./, "")}:${normalizeCompanyName(companyName)}`.slice(0, 180),
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

const money = z.number().finite().positive().max(10_000_000)

const clean = (max: number) =>
  z
    .string()
    .transform((value) => normalizeWhitespace(value.replace(/[\u0000-\u001f\u007f]/g, " ")))
    .pipe(z.string().max(max))

export const offerPayloadSchema = z
  .object({
    url: z.string().trim().max(2000).url(),
    company: clean(120).pipe(z.string().min(2, "Company is required")),
    title: clean(200).pipe(z.string().min(2, "Title is required")),
    description: z.string().max(40_000).optional(),
    location: clean(200).optional(),
    workplace: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
    salaryMin: money.optional(),
    salaryMax: money.optional(),
    salaryCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}(\/(HOUR|DAY|MONTH|YEAR))?$/, "Currency like PLN or PLN/hour")
      .optional(),
    channel: z.literal("mcp"),
  })
  .refine((value) => value.salaryMin == null || value.salaryMax == null || value.salaryMin <= value.salaryMax, {
    message: "salaryMin is above salaryMax",
    path: ["salaryMin"],
  })

export type OfferPayload = z.input<typeof offerPayloadSchema>

/** Validated, cleaned job from a payload, or the reason it was refused. Pure. */
export function payloadToJob(input: unknown): { job: ListedJob; linkOnly: boolean } | { error: string } {
  const parsed = offerPayloadSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { error: `${issue?.path.join(".") || "payload"}: ${issue?.message ?? "invalid"}` }
  }
  const data = parsed.data
  let url: URL
  try {
    url = assertSafeUrl(data.url)
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid URL" }
  }
  const host = url.hostname.toLowerCase()
  const refused = refusedHost(host)
  if (refused) return { error: refused }
  const policy = policyFor(url.toString())
  const linkOnly = isPolishBoardHost(host) || policy.linkOnly
  const description = data.description
    ? stripPersonalData(htmlToText(data.description)).slice(0, 20_000)
    : undefined
  const currency = data.salaryCurrency?.replace(/\/(HOUR|DAY|MONTH|YEAR)$/, (part) => part.toLowerCase())
  const company = stripPersonalData(data.company)
  const job = buildListedJob({
    title: stripPersonalData(data.title),
    companyName: company,
    locationText: data.location ? stripPersonalData(data.location) : undefined,
    workplaceType: data.workplace,
    descriptionText: linkOnly ? undefined : description,
    salaryMin: data.salaryMin,
    salaryMax: data.salaryMax,
    salaryCurrency: data.salaryMin != null || data.salaryMax != null ? currency : undefined,
    originalUrl: url.toString(),
    sourceType: "WEB_SEARCH",
    sourceBoardId: `mcp:${host.replace(/^www\./, "")}:${normalizeCompanyName(company) || "company"}`.slice(0, 180),
    needsHydration: false,
  })
  if (!job || job.title.length < 2 || !company) return { error: "Title and company are required" }
  return { job, linkOnly }
}

/**
 * A posting Claude read itself. Validated, recruiter contacts stripped, stored as
 * WEB_SEARCH with an `mcp:` board id. Job-board links keep title and link only.
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
    channel: "mcp"
  },
  deps: IngestDeps = {}
): Promise<IngestPayloadResult> {
  const result = payloadToJob(input)
  if ("error" in result) return { status: "rejected", message: result.error }
  const now = deps.now ?? new Date()
  const canonical = safeCanonical(result.job.originalUrl)
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
