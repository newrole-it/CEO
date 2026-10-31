import type { ListedJob, SourceType } from "src/shared/schemas"
import { asDate, buildListedJob } from "./parse"
import { htmlToText } from "src/server/jobs/text"
import { aiOptOut, excerpt } from "src/server/crawler/hygiene"
import { canonicalHref } from "./successfactors"

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonRecord
}

function typeIncludesJob(value: unknown): boolean {
  if (typeof value === "string") return value === "JobPosting" || value.endsWith("/JobPosting")
  if (Array.isArray(value)) return value.some((item) => typeIncludesJob(item))
  return false
}

function textValue(value: unknown): string | undefined {
  if (typeof value === "string") return value
  const record = asRecord(value)
  if (!record) return undefined
  if (typeof record.name === "string") return record.name
  if (typeof record["@value"] === "string") return record["@value"]
  if (typeof record.value === "string" || typeof record.value === "number")
    return String(record.value)
  return undefined
}

/** PropertyValue identifiers carry the job id in `value` and the employer in `name`. */
function identifierValue(value: unknown): string | undefined {
  const record = asRecord(value)
  if (record && (typeof record.value === "string" || typeof record.value === "number")) {
    const id = String(record.value).trim()
    if (id) return id
  }
  return textValue(value)
}

function locationText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => locationText(item))
      .filter((item): item is string => Boolean(item))
    return [...new Set(parts)].join("; ") || undefined
  }
  const record = asRecord(value)
  if (!record) return textValue(value)
  const address = asRecord(record.address) ?? record
  const parts = [
    textValue(address.addressLocality),
    textValue(address.addressRegion),
    textValue(address.addressCountry),
  ].filter(Boolean) as string[]
  return parts.join(", ") || textValue(record.name)
}

function salaryFrom(value: unknown): { min?: number; max?: number; currency?: string } {
  const record = asRecord(value)
  if (!record) return {}
  const currency = typeof record.currency === "string" ? record.currency : undefined
  const quantitative = asRecord(record.value) ?? record
  const min = numberValue(quantitative.minValue ?? quantitative.value)
  const max = numberValue(quantitative.maxValue ?? quantitative.value)
  return { min, max, currency }
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value)))
    return Number(value)
  return undefined
}

function walk(node: unknown, found: JsonRecord[]) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, found)
    return
  }
  const record = asRecord(node)
  if (!record) return
  if (typeIncludesJob(record["@type"])) found.push(record)
  if (Array.isArray(record["@graph"])) walk(record["@graph"], found)
}

export function parseJsonLdJobs(
  html: string,
  pageUrl: string,
  companyName?: string,
  opts?: { provider?: string; sourceType?: SourceType; boardId?: string; fullText?: boolean }
): ListedJob[] {
  const blocks = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  )
  const jobs: ListedJob[] = []
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block[1].trim())
    } catch {
      continue
    }
    const found: JsonRecord[] = []
    walk(parsed, found)
    for (const job of found) {
      const title = textValue(job.title) || textValue(job.name)
      const hiring = asRecord(job.hiringOrganization)
      const stated = textValue(job.url) || canonicalHref(html)
      if (!title) continue
      if (!stated && opts?.provider === "brave") continue
      const url = stated || pageUrl
      let host = ""
      try {
        host = new URL(url).hostname
      } catch {
        host = ""
      }
      const salary = salaryFrom(job.baseSalary)
      const plain = typeof job.description === "string" ? htmlToText(job.description) : undefined
      const description = plain && !opts?.fullText ? excerpt(plain) : plain
      const listed = buildListedJob({
        externalId: identifierValue(job.identifier),
        title,
        companyName: textValue(hiring?.name) || companyName,
        locationText: locationText(job.jobLocation),
        employmentType: textValue(job.employmentType),
        descriptionText: description,
        salaryMin: salary.min,
        salaryMax: salary.max,
        salaryCurrency: salary.currency,
        publishedAt: asDate(job.datePosted),
        originalUrl: url,
        sourceType: opts?.sourceType ?? "GENERIC_HTML",
        sourceBoardId: opts?.boardId,
        needsHydration: false,
        llmOptOut: aiOptOut(html, host),
      })
      if (listed) jobs.push(listed)
    }
  }
  return jobs
}
