import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { isBlockedSlug } from "./blocked"
import { asDate, buildListedJob, itemsFrom, mapWorkplace, readJson } from "./parse"
import { LIST_MAX_BYTES, type BoardList } from "./types"

const jobSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    // Ashby sends null, not a missing key, for unset fields (isRemote and workplaceType on
    // about a third of Docplanner's posts). optional() alone silently dropped those jobs.
    location: z.string().nullish(),
    employmentType: z.string().nullish(),
    descriptionPlain: z.string().nullish(),
    descriptionHtml: z.string().nullish(),
    publishedAt: z.string().nullish(),
    isRemote: z.boolean().nullish(),
    workplaceType: z.string().nullish(),
    jobUrl: z.string(),
    address: z
      .object({
        postalAddress: z.object({ addressCountry: z.string().nullish() }).passthrough().nullish(),
      })
      .passthrough()
      .nullish(),
    secondaryLocations: z
      .array(
        z
          .object({
            address: z
              .object({
                postalAddress: z
                  .object({ addressCountry: z.string().nullish() })
                  .passthrough()
                  .nullish(),
              })
              .passthrough()
              .nullish(),
          })
          .passthrough()
      )
      .nullish()
      .catch(null),
    compensation: z
      .object({
        scrapeableCompensationSalarySummary: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

/** "Staff Engineer (100% Remote within Poland)" when both workplace fields are unset. */
const REMOTE_TITLE = /\b(100%\s*)?remote\b|\bzdaln/i

export function parseAshbyJobs(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const root = z
    .object({ jobs: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.jobs ?? [] : []
  return itemsFrom(list, jobSchema).flatMap((job) => {
    const location = job.location ?? undefined
    const workplace = job.workplaceType
      ? mapWorkplace(job.workplaceType, location)
      : job.isRemote || REMOTE_TITLE.test(job.title)
      ? mapWorkplace("remote", location)
      : mapWorkplace(undefined, location)
    const listed = buildListedJob({
      externalId: job.id,
      title: job.title,
      companyName,
      locationText: location,
      countryCodes: [
        job.address?.postalAddress?.addressCountry,
        ...(job.secondaryLocations ?? []).map(
          (place) => place.address?.postalAddress?.addressCountry
        ),
      ],
      employmentType: job.employmentType ?? undefined,
      workplaceType: workplace,
      descriptionText: job.descriptionPlain ?? undefined,
      descriptionHtml: job.descriptionPlain ? undefined : job.descriptionHtml ?? undefined,
      salaryText: job.compensation?.scrapeableCompensationSalarySummary ?? undefined,
      publishedAt: asDate(job.publishedAt ?? undefined),
      originalUrl: job.jobUrl,
      sourceType: "ASHBY",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

export function ashbyListUrl(boardId: string): string {
  return `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(
    boardId
  )}?includeCompensation=true`
}

export async function listAshby(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  if (isBlockedSlug("ASHBY", boardId)) {
    return { jobs: [], proven: false, note: `Ashby slug ${boardId} is a known wrong-company board` }
  }
  const response = await http.get(ashbyListUrl(boardId), {
    maxBytes: LIST_MAX_BYTES,
    accept: "application/json",
  })
  if (response.status === 404)
    return { jobs: [], proven: false, note: `Ashby ${boardId} was not found` }
  if (response.status >= 400) throw new Error(`Ashby ${boardId} returned ${response.status}`)
  const jobs = parseAshbyJobs(readJson(response.body), boardId, companyName).filter(
    (job) => job.title
  )
  if (jobs.length === 0)
    return { jobs: [], proven: false, companyName, note: `Ashby ${boardId} has no open jobs` }
  return {
    jobs,
    proven: true,
    companyName,
    note: "Ashby payload has no company name; workplaceType is preferred over isRemote",
  }
}
