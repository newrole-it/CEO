import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { isBlockedSlug, namesAgree } from "./blocked"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import { htmlToText } from "src/server/jobs/text"
import type { BoardList } from "./types"

const postingSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    releasedDate: z.string().optional(),
    location: z
      .object({
        city: z.string().optional(),
        region: z.string().optional(),
        country: z.string().optional(),
        remote: z.boolean().optional(),
        hybrid: z.boolean().optional(),
        fullLocation: z.string().optional(),
      })
      .optional(),
    typeOfEmployment: z.object({ label: z.string().optional() }).optional(),
    company: z
      .object({ identifier: z.string().optional(), name: z.string().optional() })
      .optional(),
  })
  .passthrough()

const detailSchema = postingSchema.extend({
  jobAd: z
    .object({
      sections: z
        .object({
          jobDescription: z.object({ text: z.string().optional() }).optional(),
          qualifications: z.object({ text: z.string().optional() }).optional(),
          additionalInformation: z.object({ text: z.string().optional() }).optional(),
        })
        .optional(),
    })
    .optional(),
})

export function parseSmartRecruiters(payload: unknown, boardId: string): ListedJob[] {
  const root = z
    .object({ content: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.content ?? (Array.isArray(payload) ? payload : []) : []
  return itemsFrom(list, postingSchema).flatMap((job) => {
    const location =
      job.location?.fullLocation ||
      [job.location?.city, job.location?.region, job.location?.country].filter(Boolean).join(", ")
    const workplace = job.location?.remote ? "REMOTE" : job.location?.hybrid ? "HYBRID" : undefined
    const listed = buildListedJob({
      externalId: job.id,
      title: job.name,
      companyName: job.company?.name,
      locationText: location || undefined,
      employmentType: job.typeOfEmployment?.label,
      workplaceType: workplace,
      publishedAt: asDate(job.releasedDate),
      originalUrl: `https://jobs.smartrecruiters.com/${encodeURIComponent(
        boardId
      )}/${encodeURIComponent(job.id)}`,
      sourceType: "SMARTRECRUITERS",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return listed ? [listed] : []
  })
}

export function smartRecruitersListUrl(boardId: string, query: string): string {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    boardId
  )}/postings?${query}`
}

export function smartRecruitersJobUrl(boardId: string, jobId: string): string {
  return `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(
    boardId
  )}/postings/${encodeURIComponent(jobId)}`
}

async function fetchSrPage(
  boardId: string,
  http: HttpClient,
  filter: string,
  offset: number
): Promise<{ totalFound: number; jobs: ListedJob[] }> {
  const response = await http.get(
    smartRecruitersListUrl(boardId, `${filter}&limit=100&offset=${offset}`),
    {
      maxBytes: 4_000_000,
      accept: "application/json",
    }
  )
  if (response.status === 404) return { totalFound: 0, jobs: [] }
  if (response.status >= 400)
    throw new Error(`SmartRecruiters ${boardId} returned ${response.status}`)
  const payload = readJson(response.body) as { totalFound?: unknown }
  const totalFound = typeof payload.totalFound === "number" ? payload.totalFound : 0
  return { totalFound, jobs: parseSmartRecruiters(payload, boardId) }
}

export async function listSmartRecruiters(
  boardId: string,
  http: HttpClient,
  expectedName?: string
): Promise<BoardList> {
  if (isBlockedSlug("SMARTRECRUITERS", boardId)) {
    return { jobs: [], proven: false, note: `SmartRecruiters slug ${boardId} is blocked` }
  }
  // country=pl and locationType=REMOTE keep large boards (Bosch is thousands) off the full dump.
  const filters = ["country=pl", "locationType=REMOTE"]
  const byId = new Map<string, ListedJob>()
  let sawPositiveTotal = false
  for (const filter of filters) {
    for (const offset of [0, 100]) {
      const page = await fetchSrPage(boardId, http, filter, offset)
      if (page.totalFound > 0) sawPositiveTotal = true
      for (const job of page.jobs) {
        if (job.externalId) byId.set(job.externalId, job)
      }
      if (page.jobs.length < 100) break
    }
  }
  const jobs = Array.from(byId.values())
  const companyName = jobs.find((job) => job.companyName)?.companyName
  if (!sawPositiveTotal || jobs.length === 0 || !companyName) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `SmartRecruiters ${boardId} is unproven (totalFound 0 or missing company name). Any identifier returns HTTP 200.`,
    }
  }
  if (expectedName && !namesAgree(expectedName, companyName)) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `SmartRecruiters ${boardId} is ${companyName}, not ${expectedName}`,
    }
  }
  return { jobs, proven: true, companyName }
}

export async function hydrateSmartRecruiters(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (!job.externalId || !job.sourceBoardId || job.descriptionText) return job
  const response = await http.get(smartRecruitersJobUrl(job.sourceBoardId, job.externalId), {
    maxBytes: 2_000_000,
    accept: "application/json",
  })
  if (response.status >= 400) return { ...job, needsHydration: false }
  const parsed = detailSchema.safeParse(readJson(response.body))
  if (!parsed.success) return { ...job, needsHydration: false }
  const sections = parsed.data.jobAd?.sections
  const html = [
    sections?.jobDescription?.text,
    sections?.qualifications?.text,
    sections?.additionalInformation?.text,
  ]
    .filter(Boolean)
    .join("\n")
  return {
    ...job,
    descriptionText: html ? htmlToText(html) : job.descriptionText,
    needsHydration: false,
  }
}
