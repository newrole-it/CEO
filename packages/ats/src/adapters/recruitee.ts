import { z } from "zod"
import type { HttpClient } from "../host"
import type { ListedJob, WorkplaceType } from "../schemas"
import { tenantHost } from "./hosts"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import { LIST_MAX_BYTES, type BoardList } from "./types"

/** After this instant, Recruitee careers calls without X-Careers-Sites-Token return 401. */
export const RECRUITEE_TOKEN_DEADLINE = "2027-02-10T00:00:00.000Z"

const offerSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    location: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    country_code: z.string().nullable().optional(),
    locations: z
      .array(z.object({ country_code: z.string().nullish() }).passthrough())
      .nullish()
      .catch(null),
    remote: z.boolean().nullable().optional(),
    hybrid: z.boolean().nullable().optional(),
    on_site: z.boolean().nullable().optional(),
    department: z.string().nullable().optional(),
    employment_type_code: z.string().nullable().optional(),
    published_at: z.string().nullable().optional(),
    careers_url: z.string().nullable().optional(),
    careers_apply_url: z.string().nullable().optional(),
    company_name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    requirements: z.string().nullable().optional(),
    // Some boards send "12000" instead of 12000. A salary we can't read is undisclosed,
    // never a reason to drop the posting.
    salary: z
      .object({
        min: z.coerce.number().nullable().optional(),
        max: z.coerce.number().nullable().optional(),
        currency: z.string().nullable().optional(),
        period: z.string().nullable().optional(),
      })
      .nullable()
      .optional()
      .catch(null),
  })
  .passthrough()

export function recruiteeHost(boardId: string): string {
  return tenantHost(boardId, "recruitee.com")
}

export function recruiteeOffersUrl(boardId: string): string {
  return `https://${recruiteeHost(boardId)}/api/offers/`
}

export function recruiteeAuthBlock(now: Date, token: string | undefined): string | null {
  if (token?.trim()) return null
  if (now.getTime() >= Date.parse(RECRUITEE_TOKEN_DEADLINE)) {
    return "Recruitee requires an employer token (X-Careers-Sites-Token) from 10 February 2027. Set RECRUITEE_CAREERS_TOKEN."
  }
  return null
}

function workplace(offer: {
  remote?: boolean | null
  hybrid?: boolean | null
  on_site?: boolean | null
}): WorkplaceType {
  if (offer.hybrid) return "HYBRID"
  if (offer.remote) return "REMOTE"
  if (offer.on_site) return "ONSITE"
  return "UNKNOWN"
}

function salaryText(
  salary:
    | { min?: number | null; max?: number | null; currency?: string | null; period?: string | null }
    | null
    | undefined
): string | undefined {
  if (!salary || (salary.min == null && salary.max == null)) return undefined
  const span =
    salary.min != null && salary.max != null
      ? `${salary.min}-${salary.max}`
      : `${salary.min ?? salary.max}`
  return [span, salary.currency, salary.period].filter(Boolean).join(" ")
}

export function parseRecruiteeOffers(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const root = z
    .object({ offers: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.offers ?? [] : []
  return itemsFrom(list, offerSchema).flatMap((offer) => {
    const url = offer.careers_url || offer.careers_apply_url
    if (!url) return []
    const location = [offer.location, offer.city, offer.country]
      .filter(Boolean)
      .filter((value, index, all) => all.indexOf(value) === index)
    const description = [offer.description, offer.requirements].filter(Boolean).join("\n")
    const listed = buildListedJob({
      externalId: String(offer.id),
      title: offer.title,
      companyName: offer.company_name || companyName,
      locationText: location.join(", ") || undefined,
      countryCodes: [
        offer.country_code,
        ...(offer.locations ?? []).map((place) => place.country_code),
      ],
      employmentType: offer.employment_type_code ?? undefined,
      workplaceType: workplace(offer),
      descriptionHtml: description || undefined,
      salaryText: salaryText(offer.salary),
      publishedAt: asDate(offer.published_at),
      originalUrl: url,
      sourceType: "RECRUITEE",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

export async function listRecruitee(
  boardId: string,
  http: HttpClient,
  companyName?: string,
  now = new Date()
): Promise<BoardList> {
  const token = process.env.RECRUITEE_CAREERS_TOKEN
  const block = recruiteeAuthBlock(now, token)
  if (block) return { jobs: [], proven: false, companyName, note: block }
  const response = await http.get(recruiteeOffersUrl(boardId), {
    maxBytes: LIST_MAX_BYTES,
    accept: "application/json",
    headers: token?.trim() ? { "X-Careers-Sites-Token": token.trim() } : undefined,
  })
  if (response.status === 401) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: "Recruitee returned 401. Set RECRUITEE_CAREERS_TOKEN to the employer careers-site token.",
    }
  }
  if (response.status === 404)
    return { jobs: [], proven: false, companyName, note: `Recruitee ${boardId} was not found` }
  if (response.status >= 400) throw new Error(`Recruitee ${boardId} returned ${response.status}`)
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Recruitee ${boardId} did not return offers JSON`,
    }
  }
  const jobs = parseRecruiteeOffers(payload, boardId, companyName)
  const resolved = jobs.find((job) => job.companyName)?.companyName || companyName
  if (jobs.length === 0)
    return {
      jobs: [],
      proven: false,
      companyName: resolved,
      note: `Recruitee ${boardId} has no open jobs`,
    }
  return { jobs, proven: true, companyName: resolved }
}
