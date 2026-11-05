import { z } from "zod"
import type { HttpClient } from "../host"
import type { ListedJob } from "../schemas"
import { tenantHost } from "./hosts"
import { asDate, buildListedJob, itemsFrom, mapWorkplace, readJson } from "./parse"
import type { BoardList } from "./types"

const openingSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    jobOpeningName: z.string(),
    departmentLabel: z.string().nullable().optional(),
    employmentStatusLabel: z.string().nullable().optional(),
    location: z
      .object({
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    atsLocation: z
      .object({
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    isRemote: z.boolean().nullable().optional(),
    locationType: z.union([z.string(), z.number()]).nullable().optional(),
  })
  .passthrough()

const detailSchema = z
  .object({
    result: z
      .object({
        jobOpening: z
          .object({
            datePosted: z.string().nullable().optional(),
            description: z.string().nullable().optional(),
            jobOpeningShareUrl: z.string().nullable().optional(),
          })
          .nullable()
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

export function bambooHost(boardId: string): string {
  return tenantHost(boardId, "bamboohr.com")
}

export function bambooListUrl(boardId: string): string {
  return `https://${bambooHost(boardId)}/careers/list`
}

export function bambooDetailUrl(boardId: string, jobId: string): string {
  return `https://${bambooHost(boardId)}/careers/${encodeURIComponent(jobId)}/detail`
}

export function parseBambooOpenings(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const root = z
    .object({ result: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.result ?? [] : []
  const host = bambooHost(boardId)
  return itemsFrom(list, openingSchema).flatMap((opening) => {
    const city = opening.location?.city || opening.atsLocation?.city
    const state = opening.location?.state || opening.atsLocation?.state
    const location = [city, state].filter(Boolean).join(", ")
    const remoteHint = opening.isRemote
      ? "remote"
      : typeof opening.locationType === "string"
      ? opening.locationType
      : undefined
    const listed = buildListedJob({
      externalId: String(opening.id),
      title: opening.jobOpeningName,
      companyName,
      locationText: location || undefined,
      employmentType: opening.employmentStatusLabel ?? undefined,
      workplaceType: mapWorkplace(remoteHint, location),
      originalUrl: `https://${host}/careers/${encodeURIComponent(String(opening.id))}`,
      sourceType: "BAMBOOHR",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return listed ? [listed] : []
  })
}

export async function listBamboo(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const response = await http.get(bambooListUrl(boardId), {
    maxBytes: 4_000_000,
    accept: "application/json",
  })
  if (response.status === 404 || response.status === 302) {
    return { jobs: [], proven: false, companyName, note: `BambooHR ${boardId} was not found` }
  }
  // An account without a public careers page redirects to login.php or to a suspended-account
  // page, which answers 401 (seen on 110 catalog boards, 2026-11-03).
  if (response.status === 401) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `BambooHR ${boardId} has no public careers page (not found)`,
    }
  }
  if (response.status >= 400) throw new Error(`BambooHR ${boardId} returned ${response.status}`)
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `BambooHR ${boardId} did not return a careers list`,
    }
  }
  const jobs = parseBambooOpenings(payload, boardId, companyName)
  if (jobs.length === 0)
    return { jobs: [], proven: false, companyName, note: `BambooHR ${boardId} has no open jobs` }
  return { jobs, proven: true, companyName }
}

export async function hydrateBamboo(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (!job.externalId || !job.sourceBoardId) return job
  const response = await http.get(bambooDetailUrl(job.sourceBoardId, job.externalId), {
    maxBytes: 1_500_000,
    accept: "application/json",
  })
  if (response.status >= 400) return job
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return job
  }
  const parsed = detailSchema.safeParse(payload)
  const opening = parsed.success ? parsed.data.result?.jobOpening : undefined
  if (!opening) return job
  const next = buildListedJob({
    externalId: job.externalId,
    title: job.title,
    companyName: job.companyName,
    locationText: job.locationText,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    descriptionHtml: opening.description ?? undefined,
    publishedAt: asDate(opening.datePosted) ?? job.publishedAt,
    originalUrl: opening.jobOpeningShareUrl || job.originalUrl,
    sourceType: "BAMBOOHR",
    sourceBoardId: job.sourceBoardId,
    needsHydration: false,
  })
  return next ?? job
}
