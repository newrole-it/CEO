import { z } from "zod"
import type { ListedJob, SourceType, WorkplaceType } from "../schemas"
import { decodeEntities } from "@newrole/offers/text"
import { cleanDescription, inferWorkplace, normalizeEmployment, parseSalary } from "../normalize"

export function asDate(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(normalizeTimestamp(value))
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
}

/** Traffit and Recruitee publish timestamps with a space, and Recruitee appends "UTC". */
function normalizeTimestamp(value: string): string {
  let text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/.test(text)) {
    text = text.replace(" ", "T").replace(/\s*UTC$/i, "Z")
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(text)) text += "Z"
  }
  return text
}

export function mapWorkplace(value: unknown, location?: string): WorkplaceType {
  if (typeof value === "boolean") return value ? "REMOTE" : "UNKNOWN"
  if (typeof value !== "string") return inferWorkplace(undefined, location, undefined)
  return inferWorkplace(value, location, undefined)
}

export function buildListedJob(input: {
  externalId?: string
  title: string
  companyName?: string
  locationText?: string
  /** Countries the ATS states in its own fields: ISO codes or country names. */
  countryCodes?: (string | null | undefined)[]
  employmentType?: string
  workplaceType?: WorkplaceType
  descriptionText?: string
  descriptionHtml?: string
  salaryText?: string
  salaryMin?: number
  salaryMax?: number
  salaryCurrency?: string
  publishedAt?: Date
  originalUrl: string
  sourceType: SourceType
  sourceBoardId?: string
  needsHydration?: boolean
  llmOptOut?: boolean
  variants?: ListedJob["variants"]
}): ListedJob | null {
  const title = input.title.replace(/\s+/g, " ").trim()
  if (!title || !input.originalUrl) return null
  let url: string
  try {
    const parsed = new URL(input.originalUrl)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
    url = parsed.toString()
  } catch {
    return null
  }
  const description = cleanDescription(
    decodeEntities(input.descriptionText || input.descriptionHtml || "")
  )
  const parsedSalary = input.salaryText ? parseSalary(input.salaryText) : {}
  const workplace = input.workplaceType ?? inferWorkplace(undefined, input.locationText, undefined)
  return {
    externalId: input.externalId,
    title,
    companyName: input.companyName,
    locationText: input.locationText,
    countryCodes: countryList(input.countryCodes),
    employmentType: normalizeEmployment(input.employmentType),
    workplaceType: workplace,
    descriptionText: description || undefined,
    salaryText: input.salaryText,
    salaryMin: input.salaryMin ?? parsedSalary.min,
    salaryMax: input.salaryMax ?? parsedSalary.max,
    salaryCurrency: input.salaryCurrency ?? parsedSalary.currency,
    publishedAt: input.publishedAt,
    originalUrl: url,
    sourceType: input.sourceType,
    sourceBoardId: input.sourceBoardId,
    needsHydration: input.needsHydration ?? !description,
    llmOptOut: input.llmOptOut,
    variants: input.variants,
  }
}

function countryList(values: (string | null | undefined)[] | undefined): string[] | undefined {
  const kept = [...new Set((values ?? []).map((value) => (value || "").trim()).filter(Boolean))]
  return kept.length ? kept : undefined
}

export function readJson(body: string): unknown {
  return JSON.parse(body)
}

export function itemsFrom<S extends z.ZodTypeAny>(value: unknown, schema: S): z.output<S>[] {
  if (!Array.isArray(value)) return []
  const items: z.output<S>[] = []
  const rejected = new Map<string, number>()
  for (const item of value) {
    const parsed = schema.safeParse(item)
    if (parsed.success) items.push(parsed.data)
    else {
      const issue = parsed.error.issues[0]
      const key = `${issue?.path.join(".") || "item"}: ${issue?.message ?? "invalid"}`
      rejected.set(key, (rejected.get(key) ?? 0) + 1)
    }
  }
  // A dropped posting is a missed offer. Say so instead of shrinking the list quietly.
  if (rejected.size) {
    const detail = [...rejected].map(([key, count]) => `${count}× ${key}`).join("; ")
    console.warn(`[adapters] dropped ${value.length - items.length}/${value.length}: ${detail}`)
  }
  return items
}
