import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { excerpt } from "src/server/crawler/hygiene"
import { htmlToText } from "@newrole/offers/text"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import type { BoardList } from "./types"

/**
 * Phenom People career sites (careers.dhl.com, careers.abb, jobs.philips.com…). Board id: the
 * site host. Listing and detail are JSON POSTs to `https://{host}/widgets`, told apart by
 * `ddoKey`: refineSearch pages the jobs (teaser only), jobDetail returns one description.
 * `selected_fields.country` narrows the list to Poland, which keeps global boards small.
 * Undocumented and keyless. Verified 2026-10-31 on careers.dhl.com (126 Polish postings).
 */

export const PHENOM_PAGE_SIZE = 100
const MAX_PAGES = 10
export const PHENOM_COUNTRIES = ["Poland", "Polska"]

export function phenomHost(boardId: string): string {
  return boardId
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
}

export function phenomWidgetsUrl(boardId: string): string {
  return `https://${phenomHost(boardId)}/widgets`
}

export function phenomSearchBody(
  from: number,
  size = PHENOM_PAGE_SIZE,
  countries = PHENOM_COUNTRIES
): string {
  return JSON.stringify({
    deviceType: "desktop",
    ddoKey: "refineSearch",
    pageName: "search-results",
    jobs: true,
    counts: true,
    from,
    size,
    selected_fields: { country: countries },
  })
}

export function phenomDetailBody(jobSeqNo: string): string {
  return JSON.stringify({
    deviceType: "desktop",
    ddoKey: "jobDetail",
    pageName: "job-details",
    jobSeqNo,
  })
}

/** "/{country}/{lang}/job/{seq}" from a locale such as "en_GLOBAL"; unlocalized otherwise. */
export function phenomJobUrl(
  boardId: string,
  locale: string | undefined,
  jobSeqNo: string
): string {
  const host = phenomHost(boardId)
  const parts = (locale ?? "").split("_")
  if (parts.length === 2 && parts[0] && parts[1]) {
    return `https://${host}/${parts[1].toLowerCase()}/${parts[0].toLowerCase()}/job/${encodeURIComponent(
      jobSeqNo
    )}`
  }
  return `https://${host}/job/${encodeURIComponent(jobSeqNo)}`
}

const jobSchema = z
  .object({
    jobSeqNo: z.string(),
    title: z.string(),
    locale: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    state: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    cityState: z.string().nullable().optional(),
    cityStateCountry: z.string().nullable().optional(),
    multi_location: z.array(z.string()).nullable().optional(),
    postedDate: z.string().nullable().optional(),
    dateCreated: z.string().nullable().optional(),
    descriptionTeaser: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
    contractType1: z.string().nullable().optional(),
    workHours1: z.string().nullable().optional(),
    isRemote: z.union([z.boolean(), z.string()]).nullable().optional(),
  })
  .passthrough()

function locationOf(job: z.infer<typeof jobSchema>): string | undefined {
  if (job.multi_location?.length) return [...new Set(job.multi_location)].join("; ")
  if (job.cityStateCountry) return job.cityStateCountry
  const parts = [job.city, job.state, job.country].filter((part): part is string =>
    Boolean(part?.trim())
  )
  return parts.join(", ") || job.cityState || undefined
}

export function parsePhenomSearch(
  payload: unknown,
  boardId: string,
  companyName?: string
): { jobs: ListedJob[]; totalHits: number | null } {
  const root = z
    .object({
      refineSearch: z
        .object({
          totalHits: z.number().nullable().optional(),
          data: z
            .object({ jobs: z.array(z.unknown()).optional() })
            .passthrough()
            .optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(payload)
  if (!root.success || !root.data.refineSearch) return { jobs: [], totalHits: null }
  const search = root.data.refineSearch
  const jobs = itemsFrom(search.data?.jobs ?? [], jobSchema).flatMap((job) => {
    const teaser = job.descriptionTeaser ? excerpt(htmlToText(job.descriptionTeaser)) : undefined
    const listed = buildListedJob({
      externalId: job.jobSeqNo,
      title: job.title,
      companyName,
      locationText: locationOf(job),
      employmentType: job.contractType1 ?? job.type ?? job.workHours1 ?? undefined,
      descriptionText: teaser,
      publishedAt: asDate(job.postedDate) ?? asDate(job.dateCreated),
      originalUrl: phenomJobUrl(boardId, job.locale ?? undefined, job.jobSeqNo),
      sourceType: "PHENOM",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return listed ? [listed] : []
  })
  return { jobs, totalHits: typeof search.totalHits === "number" ? search.totalHits : null }
}

export function parsePhenomDetail(payload: unknown): {
  description?: string
  title?: string
  companyName?: string
  location?: string
  employmentType?: string
} {
  const root = z
    .object({
      jobDetail: z
        .object({
          data: z
            .object({
              job: z
                .object({
                  description: z.string().nullable().optional(),
                  title: z.string().nullable().optional(),
                  companyName: z.string().nullable().optional(),
                  jobCompany: z.string().nullable().optional(),
                  cityStateCountry: z.string().nullable().optional(),
                  contractType: z.string().nullable().optional(),
                })
                .passthrough()
                .optional(),
            })
            .passthrough()
            .optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough()
    .safeParse(payload)
  const job = root.success ? root.data.jobDetail?.data?.job : undefined
  if (!job) return {}
  return {
    description: job.description ?? undefined,
    title: job.title ?? undefined,
    companyName: job.companyName ?? job.jobCompany ?? undefined,
    location: job.cityStateCountry ?? undefined,
    employmentType: job.contractType ?? undefined,
  }
}

export async function listPhenom(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const host = phenomHost(boardId)
  const name =
    companyName || host.replace(/^(careers?|jobs?|kariera)\./, "").replace(/\.[a-z]+$/, "")
  const jobs: ListedJob[] = []
  let total: number | null = null
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await http.post(
      phenomWidgetsUrl(boardId),
      phenomSearchBody(page * PHENOM_PAGE_SIZE),
      {
        accept: "application/json",
        maxBytes: 8_000_000,
        headers: { "Content-Type": "application/json" },
      }
    )
    if (response.status === 404)
      return {
        jobs: [],
        proven: false,
        companyName,
        note: `Phenom ${host} has no widgets endpoint`,
      }
    if (response.status >= 400) throw new Error(`Phenom ${host} returned ${response.status}`)
    let payload: unknown
    try {
      payload = readJson(response.body)
    } catch {
      return { jobs: [], proven: false, companyName, note: `Phenom ${host} did not return JSON` }
    }
    const parsed = parsePhenomSearch(payload, boardId, name)
    if (parsed.totalHits == null)
      return {
        jobs: [],
        proven: false,
        companyName,
        note: `Phenom ${host} answered without refineSearch`,
      }
    total = parsed.totalHits
    jobs.push(...parsed.jobs)
    if (parsed.jobs.length === 0 || jobs.length >= total) break
  }
  const seen = new Set<string>()
  const unique = jobs.filter((job) => {
    const key = job.externalId ?? job.originalUrl
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (unique.length === 0)
    return {
      jobs: [],
      proven: true,
      companyName: name,
      note: `Phenom ${host} has no open jobs in ${PHENOM_COUNTRIES[0]}`,
    }
  const capped = total != null && unique.length < total
  return {
    jobs: unique,
    proven: true,
    companyName: name,
    listedCount: total ?? unique.length,
    complete: !capped,
    note: capped ? `Read ${unique.length} of ${total} Polish postings.` : undefined,
  }
}

export async function hydratePhenom(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (!job.externalId || !job.sourceBoardId) return job
  const response = await http.post(
    phenomWidgetsUrl(job.sourceBoardId),
    phenomDetailBody(job.externalId),
    {
      accept: "application/json",
      maxBytes: 4_000_000,
      headers: { "Content-Type": "application/json" },
    }
  )
  if (response.status >= 400) return job
  let detail
  try {
    detail = parsePhenomDetail(readJson(response.body))
  } catch {
    return job
  }
  if (!detail.description) return job
  const hydrated = buildListedJob({
    externalId: job.externalId,
    title: job.title || detail.title || "",
    companyName: job.companyName || detail.companyName,
    locationText: job.locationText || detail.location,
    employmentType: job.employmentType || detail.employmentType,
    descriptionHtml: detail.description,
    publishedAt: job.publishedAt,
    originalUrl: job.originalUrl,
    sourceType: "PHENOM",
    sourceBoardId: job.sourceBoardId,
    needsHydration: false,
  })
  return hydrated ? { ...job, ...hydrated, needsHydration: false } : job
}
