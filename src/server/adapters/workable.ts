import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { isBlockedSlug, isGenericWorkableName, namesAgree } from "./blocked"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import { parseJsonLdJobs } from "./jsonld"
import { LIST_MAX_BYTES, type BoardList } from "./types"

const jobSchema = z
  .object({
    title: z.string(),
    shortcode: z.string(),
    url: z.string(),
    // Workable sends null for unset fields, as Ashby does; optional() alone dropped those jobs.
    employment_type: z.string().nullish(),
    telecommuting: z.boolean().nullish(),
    department: z.string().nullish(),
    published_on: z.string().nullish(),
    created_at: z.string().nullish(),
    country: z.string().nullish(),
    city: z.string().nullish(),
    state: z.string().nullish(),
    description: z.string().nullish(),
    locations: z
      .array(
        z
          .object({
            city: z.string().nullish(),
            country: z.string().nullish(),
            countryCode: z.string().nullish(),
          })
          .passthrough()
      )
      .nullish(),
  })
  .passthrough()

export function parseWorkableJobs(
  payload: unknown,
  boardId: string
): { companyName?: string; jobs: ListedJob[] } {
  const root = z
    .object({
      name: z.string().optional(),
      jobs: z.array(z.unknown()).optional(),
    })
    .passthrough()
    .safeParse(payload)
  if (!root.success) return { jobs: [] }
  // The widget lists a posting once per location under one shortcode (cxg on 2026-11-03: 1,469
  // entries, 554 shortcodes, 15 of them in more than one country). One posting keeps them all.
  const byCode = new Map<string, z.infer<typeof jobSchema>>()
  for (const job of itemsFrom(root.data.jobs ?? [], jobSchema)) {
    const places = job.locations?.length
      ? job.locations
      : [{ city: job.city, country: job.country }]
    const seen = byCode.get(job.shortcode)
    if (!seen) {
      byCode.set(job.shortcode, { ...job, locations: [...places] })
      continue
    }
    for (const place of places) {
      const known = (seen.locations ?? []).some(
        (item) => item.city === place.city && item.country === place.country
      )
      if (!known) seen.locations = [...(seen.locations ?? []), place]
    }
  }
  const jobs = [...byCode.values()].flatMap((job) => {
    const fromLocations = (job.locations ?? [])
      .map((item) => [item.city, item.country].filter(Boolean).join(", "))
      .filter(Boolean)
    const location =
      fromLocations.join(" | ") || [job.city, job.state, job.country].filter(Boolean).join(", ")
    const listed = buildListedJob({
      externalId: job.shortcode,
      title: job.title,
      companyName: root.data.name,
      locationText: location || undefined,
      countryCodes: [...(job.locations ?? []).map((item) => item.countryCode), job.country],
      employmentType: job.employment_type ?? undefined,
      workplaceType: job.telecommuting ? "REMOTE" : undefined,
      descriptionHtml: job.description ?? undefined,
      publishedAt: asDate(job.published_on) ?? asDate(job.created_at),
      originalUrl: job.url,
      sourceType: "WORKABLE",
      sourceBoardId: boardId,
      needsHydration: !job.description,
    })
    return listed ? [listed] : []
  })
  return { companyName: root.data.name, jobs }
}

export function workableListUrl(boardId: string): string {
  return `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(
    boardId
  )}?details=true`
}

export async function listWorkable(
  boardId: string,
  http: HttpClient,
  expectedName?: string
): Promise<BoardList> {
  if (isBlockedSlug("WORKABLE", boardId)) {
    return {
      jobs: [],
      proven: false,
      note: `Workable slug ${boardId} is a known wrong-company account`,
    }
  }
  const response = await http.get(workableListUrl(boardId), {
    maxBytes: LIST_MAX_BYTES,
    accept: "application/json",
  })
  if (response.status === 404)
    return { jobs: [], proven: false, note: `Workable ${boardId} was not found` }
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
  return { jobs: parsed.jobs, proven: true, companyName: parsed.companyName }
}

export async function hydrateWorkable(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText) return job
  const response = await http.get(job.originalUrl, { maxBytes: 1_500_000, accept: "text/html" })
  if (response.status >= 400) return { ...job, needsHydration: false }
  const fromLd = parseJsonLdJobs(response.body, job.originalUrl)[0]
  if (!fromLd) return { ...job, needsHydration: false }
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
