import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { namesAgree } from "./blocked"
import { isSlugAlias, tenantHost } from "./hosts"
import { parseJsonLdJobs } from "./jsonld"
import { asDate, buildListedJob, itemsFrom, mapWorkplace, readJson } from "./parse"
import type { BoardList } from "./types"

const positionSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    name: z.string(),
    url: z.string(),
    published_date: z.string().nullable().optional(),
    department: z.string().nullable().optional(),
    type: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
    location: z
      .object({
        name: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        is_remote: z.boolean().nullable().optional(),
      })
      .nullable()
      .optional(),
    company: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
    salary: z.string().nullable().optional(),
  })
  .passthrough()

export function breezyHost(boardId: string): string {
  return tenantHost(boardId, "breezy.hr")
}

export function breezyFeedUrl(boardId: string): string {
  return `https://${breezyHost(boardId)}/json`
}

export function parseBreezyPositions(
  payload: unknown,
  boardId: string,
  companyName?: string
): { jobs: ListedJob[]; companyName?: string } {
  const positions = itemsFrom(Array.isArray(payload) ? payload : [], positionSchema)
  const fromFeed = positions.find((position) => position.company?.name)?.company?.name ?? undefined
  const resolved = companyName || fromFeed || undefined
  const jobs = positions.flatMap((position) => {
    const location = [position.location?.name, position.location?.city, position.location?.country]
      .filter(Boolean)
      .join(", ")
    const listed = buildListedJob({
      externalId: String(position.id),
      title: position.name,
      companyName: position.company?.name || resolved,
      locationText: location || undefined,
      employmentType: position.type?.name ?? undefined,
      workplaceType: position.location?.is_remote ? "REMOTE" : mapWorkplace(undefined, location),
      salaryText: position.salary ?? undefined,
      publishedAt: asDate(position.published_date),
      originalUrl: position.url,
      sourceType: "BREEZY",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return listed ? [listed] : []
  })
  return { jobs, companyName: fromFeed || resolved }
}

export async function listBreezy(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const response = await http.get(breezyFeedUrl(boardId), {
    maxBytes: 4_000_000,
    accept: "application/json",
  })
  if (response.status === 404 || response.status === 403) {
    return { jobs: [], proven: false, companyName, note: `Breezy ${boardId} was not found` }
  }
  if (response.status >= 400) throw new Error(`Breezy ${boardId} returned ${response.status}`)
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Breezy ${boardId} did not return a job list`,
    }
  }
  const parsed = parseBreezyPositions(payload, boardId, companyName)
  if (
    companyName &&
    parsed.companyName &&
    !isSlugAlias(companyName, boardId) &&
    !namesAgree(companyName, parsed.companyName)
  ) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Breezy company “${parsed.companyName}” does not match ${companyName}`,
    }
  }
  if (parsed.jobs.length === 0)
    return {
      jobs: [],
      proven: false,
      companyName: parsed.companyName,
      note: `Breezy ${boardId} has no open jobs`,
    }
  return { jobs: parsed.jobs, proven: true, companyName: parsed.companyName || companyName }
}

export async function hydrateBreezy(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  const response = await http.get(job.originalUrl, { maxBytes: 1_500_000, accept: "text/html" })
  if (response.status >= 400) return job
  const found = parseJsonLdJobs(response.body, response.url || job.originalUrl)
  const description = found.find((item) => item.descriptionText)?.descriptionText
  if (!description) return job
  return { ...job, descriptionText: description, needsHydration: false }
}
