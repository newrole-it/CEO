import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { isBlockedSlug } from "./blocked"
import { asDate, buildListedJob, itemsFrom, mapWorkplace, readJson } from "./parse"
import type { BoardList } from "./types"

const postingSchema = z
  .object({
    id: z.string(),
    text: z.string(),
    hostedUrl: z.string().optional(),
    applyUrl: z.string().optional(),
    createdAt: z.number().optional(),
    workplaceType: z.string().optional(),
    descriptionPlain: z.string().optional(),
    description: z.string().optional(),
    categories: z
      .object({
        commitment: z.string().optional(),
        location: z.string().optional(),
        allLocations: z.array(z.string()).optional(),
        team: z.string().optional(),
      })
      .optional(),
    salaryRange: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        currency: z.string().optional(),
        interval: z.string().optional(),
      })
      .nullable()
      .optional()
      // An unreadable range is undisclosed pay, not a reason to drop the posting.
      .catch(null),
  })
  .passthrough()

export function parseLeverPostings(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const list = Array.isArray(payload) ? payload : []
  return itemsFrom(list, postingSchema).flatMap((job) => {
    const url = job.hostedUrl || job.applyUrl
    if (!url) return []
    const listed = buildListedJob({
      externalId: job.id,
      title: job.text,
      companyName,
      locationText: job.categories?.allLocations?.join(" | ") || job.categories?.location,
      employmentType: job.categories?.commitment,
      workplaceType: mapWorkplace(job.workplaceType, job.categories?.location),
      descriptionText: job.descriptionPlain,
      descriptionHtml: job.descriptionPlain ? undefined : job.description,
      salaryText: leverSalaryText(job.salaryRange),
      publishedAt: asDate(job.createdAt),
      originalUrl: url,
      sourceType: "LEVER",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

function leverSalaryText(
  range: { min?: number; max?: number; currency?: string; interval?: string } | null | undefined
): string | undefined {
  if (!range || (range.min == null && range.max == null)) return undefined
  const span =
    range.min != null && range.max != null
      ? `${range.min}-${range.max}`
      : `${range.min ?? range.max}`
  return [span, range.currency, range.interval].filter(Boolean).join(" ")
}

export function leverSlug(boardId: string): string {
  return boardId.toLowerCase().startsWith("eu:") ? boardId.slice(3) : boardId
}

/** EU-marked boards try api.eu.lever.co first. Others try the global host, then the EU host only on 404. */
export function leverPostingUrls(boardId: string): string[] {
  const slug = encodeURIComponent(leverSlug(boardId))
  const global = `https://api.lever.co/v0/postings/${slug}?mode=json`
  const eu = `https://api.eu.lever.co/v0/postings/${slug}?mode=json`
  return boardId.toLowerCase().startsWith("eu:") ? [eu, global] : [global, eu]
}

export function leverListUrl(boardId: string): string {
  return leverPostingUrls(boardId)[0]
}

export async function listLever(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const slug = leverSlug(boardId)
  if (isBlockedSlug("LEVER", slug)) {
    return { jobs: [], proven: false, note: `Lever slug ${slug} is a known wrong-company board` }
  }
  for (const url of leverPostingUrls(boardId)) {
    const response = await http.get(url, { maxBytes: 8_000_000, accept: "application/json" })
    if (response.status === 404) continue
    if (response.status >= 400) throw new Error(`Lever ${slug} returned ${response.status}`)
    const jobs = parseLeverPostings(readJson(response.body), boardId, companyName)
    if (jobs.length === 0)
      return { jobs: [], proven: false, companyName, note: `Lever ${slug} has no open jobs` }
    return {
      jobs,
      proven: true,
      companyName,
      note: companyName ? undefined : "Lever payload has no company name; identity is the slug",
    }
  }
  return { jobs: [], proven: false, note: `Lever ${slug} was not found` }
}
