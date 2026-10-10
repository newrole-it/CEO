import {z} from "zod"
import type {HttpClient} from "src/server/security/safe-fetch"
import type {ListedJob} from "src/shared/schemas"
import {isBlockedSlug, isGenericWorkableName, namesAgree} from "./blocked"
import {asDate, buildListedJob, itemsFrom, readJson} from "./parse"
import {parseJsonLdJobs} from "./jsonld"
import type {BoardList} from "./types"

const jobSchema = z
  .object({
    title: z.string(),
    shortcode: z.string(),
    url: z.string(),
    employment_type: z.string().optional(),
    telecommuting: z.boolean().optional(),
    department: z.string().optional(),
    published_on: z.string().optional(),
    created_at: z.string().optional(),
    country: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    description: z.string().optional(),
    locations: z
      .array(
        z
          .object({
            city: z.string().optional(),
            country: z.string().optional(),
            countryCode: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough()

export function parseWorkableJobs(payload: unknown, boardId: string): {companyName?: string; jobs: ListedJob[]} {
  const root = z
    .object({
      name: z.string().optional(),
      jobs: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload)
  if (!root.success) return {jobs: []}
  const jobs = itemsFrom(root.data.jobs ?? [], jobSchema).flatMap((job) => {
    const fromLocations = (job.locations ?? [])
      .map((item) => [item.city, item.country].filter(Boolean).join(", "))
      .filter(Boolean)
    const location = fromLocations.join(" | ") || [job.city, job.state, job.country].filter(Boolean).join(", ")
    const listed = buildListedJob({
      externalId: job.shortcode,
      title: job.title,
      companyName: root.data.name,
      locationText: location || undefined,
      employmentType: job.employment_type,
      workplaceType: job.telecommuting ? "REMOTE" : undefined,
      descriptionHtml: job.description,
      publishedAt: asDate(job.published_on) ?? asDate(job.created_at),
      originalUrl: job.url,
      sourceType: "WORKABLE",
      sourceBoardId: boardId,
      needsHydration: !job.description,
    })
    return listed ? [listed] : []
  })
  return {companyName: root.data.name, jobs}
}

export function workableListUrl(boardId: string): string {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(boardId)}?details=true`
}

export async function listWorkable(boardId: string, http: HttpClient, expectedName?: string): Promise<BoardList> {
  if (isBlockedSlug("WORKABLE", boardId)) {
    return {jobs: [], proven: false, note: `Workable slug ${boardId} is a known wrong-company account`}
  }
  const response = await http.get(workableListUrl(boardId), {maxBytes: 8_000_000, accept: "application/json"})
  if (response.status === 404) return {jobs: [], proven: false, note: `Workable ${boardId} was not found`}
  if (response.status >= 400) throw new Error(`Workable ${boardId} returned ${response.status}`)
  const parsed = parseWorkableJobs(readJson(response.body), boardId)
  if (isGenericWorkableName(parsed.companyName) || parsed.jobs.length === 0) {
    return {
      jobs: [],
      proven: false,
      companyName: parsed.companyName,
      note: `Workable ${boardId} is unproven (empty jobs or a generic account name)`,
    }
  }
  if (expectedName && !namesAgree(expectedName, parsed.companyName)) {
    return {
      jobs: [],
      proven: false,
      companyName: parsed.companyName,
      note: `Workable ${boardId} is ${parsed.companyName}, not ${expectedName}`,
    }
  }
  return {jobs: parsed.jobs, proven: true, companyName: parsed.companyName}
}

export async function hydrateWorkable(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText) return job
  const response = await http.get(job.originalUrl, {maxBytes: 1_500_000, accept: "text/html"})
  if (response.status >= 400) return {...job, needsHydration: false}
  const fromLd = parseJsonLdJobs(response.body, job.originalUrl)[0]
  if (!fromLd) return {...job, needsHydration: false}
  return {
    ...job,
    descriptionText: fromLd.descriptionText || job.descriptionText,
    workplaceType: job.workplaceType === "UNKNOWN" ? fromLd.workplaceType : job.workplaceType,
    salaryMin: job.salaryMin ?? fromLd.salaryMin,
    salaryMax: job.salaryMax ?? fromLd.salaryMax,
    salaryCurrency: job.salaryCurrency ?? fromLd.salaryCurrency,
    needsHydration: false,
  }
}
