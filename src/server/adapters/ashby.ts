import {z} from "zod"
import type {HttpClient} from "src/server/security/safe-fetch"
import type {ListedJob} from "src/shared/schemas"
import {isBlockedSlug} from "./blocked"
import {asDate, buildListedJob, itemsFrom, mapWorkplace, readJson} from "./parse"
import type {BoardList} from "./types"

const jobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    location: z.string().optional(),
    employmentType: z.string().optional(),
    descriptionPlain: z.string().optional(),
    descriptionHtml: z.string().optional(),
    publishedAt: z.string().optional(),
    isRemote: z.boolean().optional(),
    workplaceType: z.string().optional(),
    jobUrl: z.string(),
    compensation: z
      .object({
        scrapeableCompensationSalarySummary: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

export function parseAshbyJobs(payload: unknown, boardId: string, companyName?: string): ListedJob[] {
  const root = z.object({jobs: z.array(z.unknown()).optional()}).passthrough().safeParse(payload)
  const list = root.success ? root.data.jobs ?? [] : []
  return itemsFrom(list, jobSchema).flatMap((job) => {
    const workplace = job.workplaceType
      ? mapWorkplace(job.workplaceType, job.location)
      : job.isRemote
        ? mapWorkplace("remote", job.location)
        : mapWorkplace(undefined, job.location)
    const listed = buildListedJob({
      externalId: job.id,
      title: job.title,
      companyName,
      locationText: job.location,
      employmentType: job.employmentType,
      workplaceType: workplace,
      descriptionText: job.descriptionPlain,
      descriptionHtml: job.descriptionPlain ? undefined : job.descriptionHtml,
      salaryText: job.compensation?.scrapeableCompensationSalarySummary ?? undefined,
      publishedAt: asDate(job.publishedAt),
      originalUrl: job.jobUrl,
      sourceType: "ASHBY",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

export function ashbyListUrl(boardId: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardId)}?includeCompensation=true`
}

export async function listAshby(boardId: string, http: HttpClient, companyName?: string): Promise<BoardList> {
  if (isBlockedSlug("ASHBY", boardId)) {
    return {jobs: [], proven: false, note: `Ashby slug ${boardId} is a known wrong-company board`}
  }
  const response = await http.get(ashbyListUrl(boardId), {maxBytes: 8_000_000, accept: "application/json"})
  if (response.status === 404) return {jobs: [], proven: false, note: `Ashby ${boardId} was not found`}
  if (response.status >= 400) throw new Error(`Ashby ${boardId} returned ${response.status}`)
  const jobs = parseAshbyJobs(readJson(response.body), boardId, companyName).filter((job) => job.title)
  if (jobs.length === 0) return {jobs: [], proven: false, companyName, note: `Ashby ${boardId} has no open jobs`}
  return {
    jobs,
    proven: true,
    companyName,
    note: "Ashby payload has no company name; workplaceType is preferred over isRemote",
  }
}
