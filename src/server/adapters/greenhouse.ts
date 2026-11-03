import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { isBlockedSlug, namesAgree } from "./blocked"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import { LIST_MAX_BYTES, type BoardList } from "./types"

const jobSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    absolute_url: z.string(),
    location: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
    updated_at: z.string().nullable().optional(),
    first_published: z.string().nullable().optional(),
    company_name: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    pay_input_ranges: z.array(z.unknown()).optional(),
  })
  .passthrough()

export function parseGreenhouseJobs(payload: unknown, boardId: string): ListedJob[] {
  const root = z
    .object({ jobs: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.jobs ?? [] : Array.isArray(payload) ? payload : []
  return itemsFrom(list, jobSchema).flatMap((job) => {
    const listed = buildListedJob({
      externalId: String(job.id),
      title: job.title,
      companyName: job.company_name ?? undefined,
      locationText: job.location?.name ?? undefined,
      descriptionHtml: job.content ?? undefined,
      salaryText: greenhousePayText(job.pay_input_ranges),
      publishedAt: asDate(job.first_published) ?? asDate(job.updated_at),
      originalUrl: job.absolute_url,
      sourceType: "GREENHOUSE",
      sourceBoardId: boardId,
      needsHydration: !job.content,
    })
    return listed ? [listed] : []
  })
}

export function greenhouseListUrl(boardId: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardId)}/jobs`
}

export function greenhouseJobUrl(boardId: string, jobId: string): string {
  return `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(
    boardId
  )}/jobs/${encodeURIComponent(jobId)}?pay_transparency=true`
}

export function greenhousePayText(ranges: unknown): string | undefined {
  if (!Array.isArray(ranges)) return undefined
  const parts: string[] = []
  for (const range of ranges) {
    if (!range || typeof range !== "object") continue
    const row = range as { min_cents?: unknown; max_cents?: unknown; currency_type?: unknown }
    const min = typeof row.min_cents === "number" ? Math.round(row.min_cents / 100) : null
    const max = typeof row.max_cents === "number" ? Math.round(row.max_cents / 100) : null
    if (min == null && max == null) continue
    const currency = typeof row.currency_type === "string" ? row.currency_type : "USD"
    parts.push(
      `${min ?? ""}-${max ?? ""} ${currency} per year`.replace(/^-/, "").replace(/-\s/, "")
    )
  }
  return parts.length ? parts.join("; ") : undefined
}

export async function listGreenhouse(
  boardId: string,
  http: HttpClient,
  expectedName?: string
): Promise<BoardList> {
  if (isBlockedSlug("GREENHOUSE", boardId)) {
    return {
      jobs: [],
      proven: false,
      note: `Greenhouse slug ${boardId} is a known wrong-company board`,
    }
  }
  const response = await http.get(greenhouseListUrl(boardId), {
    maxBytes: LIST_MAX_BYTES,
    accept: "application/json",
  })
  if (response.status === 404)
    return { jobs: [], proven: false, note: `Greenhouse ${boardId} was not found` }
  if (response.status >= 400) throw new Error(`Greenhouse ${boardId} returned ${response.status}`)
  const jobs = parseGreenhouseJobs(readJson(response.body), boardId)
  const companyName = jobs.find((job) => job.companyName)?.companyName
  if (jobs.length === 0)
    return { jobs: [], proven: false, companyName, note: `Greenhouse ${boardId} has no open jobs` }
  if (expectedName && companyName && !namesAgree(expectedName, companyName)) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Greenhouse ${boardId} is ${companyName}, not ${expectedName}`,
    }
  }
  if (!expectedName && !companyName) {
    return { jobs: [], proven: false, note: `Greenhouse ${boardId} did not include a company name` }
  }
  return { jobs, proven: true, companyName: companyName || expectedName }
}

export async function hydrateGreenhouse(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (!job.externalId || !job.sourceBoardId || job.descriptionText) return job
  const response = await http.get(greenhouseJobUrl(job.sourceBoardId, job.externalId), {
    maxBytes: 2_000_000,
    accept: "application/json",
  })
  if (response.status >= 400) return job
  const parsed = parseGreenhouseJobs({ jobs: [readJson(response.body)] }, job.sourceBoardId)
  return parsed[0] ? { ...parsed[0], needsHydration: false } : job
}
