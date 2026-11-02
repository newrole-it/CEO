import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { inferWorkplace } from "src/server/jobs/normalize"
import { tenantHost } from "./hosts"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import type { BoardList } from "./types"

const PAGE_SIZE = 50
const MAX_PAGES = 4
const DESCRIPTION_FIELDS = new Set(["description", "requirements", "responsibilities", "benefits"])
const CITY_PATTERN =
  /\b(Warsaw|Warszawa|Krak[óo]w|Wroc[łl]aw|Gda[ńn]sk|Pozna[ńn]|[ŁL][óo]d[źz]|Katowice|Gliwice|Szczecin|Lublin|Bydgoszcz|Bia[łl]ystok|Rzesz[óo]w|Gdynia|Poland|Polska)\b/i

const postSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    url: z.string().nullable().optional(),
    awarded: z.boolean().nullable().optional(),
    valid_start: z.string().nullable().optional(),
    application_form: z.string().nullable().optional(),
    advert: z
      .object({
        name: z.string().optional(),
        locations: z
          .array(
            z
              .object({
                locality: z.string().nullable().optional(),
                country: z.string().nullable().optional(),
              })
              .passthrough()
          )
          .optional(),
        values: z
          .array(
            z
              .object({
                field_id: z.string(),
                value: z.unknown().optional(),
              })
              .passthrough()
          )
          .optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

export function traffitHost(boardId: string): string {
  return tenantHost(boardId, "traffit.com")
}

export function traffitListUrl(boardId: string): string {
  return `https://${traffitHost(boardId)}/public/job_posts/published`
}

function fieldText(
  values: Array<{ field_id: string; value?: unknown }> | undefined,
  fieldId: string
): string | undefined {
  const value = values?.find((item) => item.field_id === fieldId)?.value
  return typeof value === "string" && value.trim() ? value : undefined
}

export function parseTraffitPosts(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const list = Array.isArray(payload) ? payload : []
  return itemsFrom(list, postSchema).flatMap((post) => {
    if (post.awarded) return []
    const title = post.advert?.name
    const url = post.url || post.application_form
    if (!title || !url) return []
    const places = (post.advert?.locations ?? [])
      .map((place) => [place.locality, place.country].filter(Boolean).join(", "))
      .filter(Boolean)
    const description = ["description", "requirements", "responsibilities", "benefits"]
      .filter((field) => DESCRIPTION_FIELDS.has(field))
      .map((field) => fieldText(post.advert?.values, field))
      .filter((value): value is string => Boolean(value))
      .join("\n")
    const location = places.join(" | ") || description.match(CITY_PATTERN)?.[0]
    const listed = buildListedJob({
      externalId: String(post.id),
      title,
      companyName,
      locationText: location,
      workplaceType: inferWorkplace(undefined, location, description),
      descriptionHtml: description || undefined,
      publishedAt: asDate(post.valid_start),
      originalUrl: url,
      sourceType: "TRAFFIT",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

export async function listTraffit(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const jobs: ListedJob[] = []
  const seen = new Set<string>()
  // Stays true only if the loop ran out of pages before the board said it had ended.
  let capped = true
  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await http.get(traffitListUrl(boardId), {
      maxBytes: 8_000_000,
      accept: "application/json",
      headers: {
        "X-Request-Page-Size": String(PAGE_SIZE),
        "X-Request-Current-Page": String(page),
      },
    })
    if (page === 1 && (response.status === 404 || response.status === 503)) {
      return { jobs: [], proven: false, companyName, note: `Traffit ${boardId} was not found` }
    }
    // A later page that fails leaves a partial list. Returned as proven, it would close every
    // job past page 1, so the whole board fails and is retried.
    if (response.status >= 400) throw new Error(`Traffit ${boardId} returned ${response.status}`)
    let payload: unknown
    try {
      payload = readJson(response.body)
    } catch {
      return {
        jobs: [],
        proven: false,
        companyName,
        note: `Traffit ${boardId} did not return a job list`,
      }
    }
    const parsed = parseTraffitPosts(payload, boardId, companyName)
    let added = 0
    for (const job of parsed) {
      const key = job.externalId || job.originalUrl
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push(job)
      added += 1
    }
    const totalPages = Number(response.headers?.["x-result-total-pages"] ?? "1")
    if (
      !Number.isFinite(totalPages) ||
      page >= totalPages ||
      added === 0 ||
      parsed.length < PAGE_SIZE
    ) {
      capped = false
      break
    }
  }
  if (jobs.length === 0) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: companyName
        ? `Traffit ${boardId} has no open jobs`
        : "Traffit payload has no company name",
    }
  }
  const notes = [
    companyName ? "" : "Traffit payload has no company name; identity is the slug",
    capped ? `Read the first ${MAX_PAGES} pages only, so nothing is closed` : "",
  ].filter(Boolean)
  return {
    jobs,
    proven: true,
    companyName,
    note: notes.length ? notes.join(". ") : undefined,
    listedCount: jobs.length,
    complete: !capped,
  }
}
