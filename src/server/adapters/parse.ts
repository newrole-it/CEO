import {z} from "zod"
import type {ListedJob, SourceType, WorkplaceType} from "src/shared/schemas"
import {
  cleanDescription,
  inferWorkplace,
  normalizeEmployment,
  parseSalary,
} from "src/server/jobs/normalize"

export function asDate(value: unknown): Date | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value > 10_000_000_000 ? value : value * 1000)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }
  return undefined
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
}): ListedJob | null {
  const title = input.title.replace(/\s+/g, " ").trim()
  if (!title || !input.originalUrl) return null
  let url: string
  try {
    url = new URL(input.originalUrl).toString()
  } catch {
    return null
  }
  const description = cleanDescription(input.descriptionText || input.descriptionHtml)
  const parsedSalary = input.salaryText ? parseSalary(input.salaryText) : {}
  const workplace = input.workplaceType ?? inferWorkplace(undefined, input.locationText, undefined)
  return {
    externalId: input.externalId,
    title,
    companyName: input.companyName,
    locationText: input.locationText,
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
  }
}

export function readJson(body: string): unknown {
  return JSON.parse(body)
}

export function itemsFrom<T>(value: unknown, schema: z.ZodType<T>): T[] {
  if (!Array.isArray(value)) return []
  const items: T[] = []
  for (const item of value) {
    const parsed = schema.safeParse(item)
    if (parsed.success) items.push(parsed.data)
  }
  return items
}
