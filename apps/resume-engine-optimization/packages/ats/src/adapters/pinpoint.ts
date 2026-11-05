import { z } from "zod"
import type { HttpClient } from "../host"
import type { ListedJob } from "../schemas"
import { compactName, namesAgree } from "./blocked"
import { tenantHost } from "./hosts"
import { buildListedJob, itemsFrom, mapWorkplace, readJson } from "./parse"
import type { BoardList } from "./types"

const postingSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    title: z.string(),
    url: z.string(),
    description: z.string().nullable().optional(),
    key_responsibilities: z.string().nullable().optional(),
    skills_knowledge_expertise: z.string().nullable().optional(),
    employment_type: z.string().nullable().optional(),
    workplace_type: z.string().nullable().optional(),
    workplace_type_text: z.string().nullable().optional(),
    compensation_visible: z.boolean().nullable().optional(),
    compensation_minimum: z.number().nullable().optional(),
    compensation_maximum: z.number().nullable().optional(),
    compensation_currency: z.string().nullable().optional(),
    compensation_frequency: z.string().nullable().optional(),
    location: z
      .object({
        name: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    job: z
      .object({
        division: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
        department: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
      })
      .nullable()
      .optional(),
  })
  .passthrough()

type PinpointPosting = z.infer<typeof postingSchema>

export function pinpointHost(boardId: string): string {
  return tenantHost(boardId, "pinpointhq.com")
}

export function pinpointFeedUrl(boardId: string): string {
  return `https://${pinpointHost(boardId)}/postings.json`
}

export function pinpointAcceptsBoard(input: {
  expectedName?: string
  boardId: string
  divisionName?: string
  titles: string[]
  texts: string[]
}): { ok: boolean; companyName?: string; note?: string } {
  const division = input.divisionName?.trim()
  const demoTitle = input.titles.some((title) => /head of dei/i.test(title))
  const acme = compactName(division ?? "") === "acme"
  const expected = input.expectedName?.trim()
  const slugOnly = !expected || expected.toLowerCase() === input.boardId.trim().toLowerCase()
  const blob = [...input.titles, ...input.texts].join("\n")
  if (expected && !slugOnly) {
    if (division && namesAgree(expected, division)) return { ok: true, companyName: division }
    if (compactName(expected).length >= 3 && compactName(blob).includes(compactName(expected))) {
      return { ok: true, companyName: expected }
    }
    return {
      ok: false,
      note: `Pinpoint division “${division || "unknown"}” does not match ${expected}`,
    }
  }
  if (division && !acme && !demoTitle) return { ok: true, companyName: division }
  return {
    ok: false,
    note: "Pinpoint slug failed the identity check (demo or unrelated board). Hostname is not identity.",
  }
}

function salaryText(posting: PinpointPosting): string | undefined {
  if (!posting.compensation_visible) return undefined
  if (posting.compensation_minimum == null && posting.compensation_maximum == null) return undefined
  const span =
    posting.compensation_minimum != null && posting.compensation_maximum != null
      ? `${posting.compensation_minimum}-${posting.compensation_maximum}`
      : `${posting.compensation_minimum ?? posting.compensation_maximum}`
  return [span, posting.compensation_currency, posting.compensation_frequency]
    .filter(Boolean)
    .join(" ")
}

export function parsePinpointPostings(
  payload: unknown,
  boardId: string,
  companyName?: string
): { jobs: ListedJob[]; divisionName?: string; titles: string[]; texts: string[] } {
  const root = z
    .object({ data: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.data ?? [] : []
  const postings = itemsFrom(list, postingSchema)
  const divisionName =
    postings.find((posting) => posting.job?.division?.name)?.job?.division?.name ?? undefined
  const titles = postings.map((posting) => posting.title)
  const texts = postings.flatMap((posting) =>
    [posting.description, posting.key_responsibilities, posting.skills_knowledge_expertise].filter(
      (value): value is string => Boolean(value)
    )
  )
  const jobs = postings.flatMap((posting) => {
    const description = [
      posting.description,
      posting.key_responsibilities,
      posting.skills_knowledge_expertise,
    ]
      .filter(Boolean)
      .join("\n")
    const listed = buildListedJob({
      externalId: String(posting.id),
      title: posting.title,
      companyName,
      locationText: posting.location?.name || posting.location?.city || undefined,
      employmentType: posting.employment_type ?? undefined,
      workplaceType: mapWorkplace(
        posting.workplace_type || posting.workplace_type_text,
        posting.location?.name ?? undefined
      ),
      descriptionHtml: description || undefined,
      salaryText: salaryText(posting),
      originalUrl: posting.url,
      sourceType: "PINPOINT",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
  return { jobs, divisionName: divisionName ?? undefined, titles, texts }
}

export async function listPinpoint(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const response = await http.get(pinpointFeedUrl(boardId), {
    maxBytes: 8_000_000,
    accept: "application/json",
  })
  if (response.status === 404)
    return { jobs: [], proven: false, companyName, note: `Pinpoint ${boardId} was not found` }
  if (response.status >= 400) throw new Error(`Pinpoint ${boardId} returned ${response.status}`)
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Pinpoint ${boardId} did not return postings JSON`,
    }
  }
  const parsed = parsePinpointPostings(payload, boardId, companyName)
  const identity = pinpointAcceptsBoard({
    expectedName: companyName,
    boardId,
    divisionName: parsed.divisionName,
    titles: parsed.titles,
    texts: parsed.texts,
  })
  if (!identity.ok) return { jobs: [], proven: false, companyName, note: identity.note }
  const resolved = identity.companyName || companyName
  const jobs = parsed.jobs.map((job) => ({ ...job, companyName: resolved }))
  if (jobs.length === 0)
    return {
      jobs: [],
      proven: false,
      companyName: resolved,
      note: `Pinpoint ${boardId} has no open jobs`,
    }
  return { jobs, proven: true, companyName: resolved }
}
