import type { ListedJob, SourceType } from "src/shared/schemas"
import { excerpt } from "src/server/crawler/hygiene"
import { htmlToText } from "@newrole/offers/text"
import { asDate, buildListedJob } from "src/server/adapters/parse"

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
  if (typeof value === "string" && value.trim()) return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  const record = asRecord(value)
  if (!record) return undefined
  if (typeof record.name === "string") return record.name
  if (typeof record["@value"] === "string") return record["@value"]
  if (typeof record.value === "string" || typeof record.value === "number")
    return String(record.value)
  return undefined
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

function walk(node: unknown, found: JsonRecord[]) {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, found)
    return
  }
  const record = asRecord(node)
  if (!record) return
  if (typeIncludesJob(record["@type"])) found.push(record)
  if (record.item) walk(record.item, found)
  if (record.dataFeedElement) walk(record.dataFeedElement, found)
  if (Array.isArray(record["@graph"])) walk(record["@graph"], found)
}

/** First absolute jobs.feed.json URL, or /jobs.feed.json when the file only names it. */
export function feedUrlFromLlms(text: string, base: string): string | null {
  const absolute = text.match(/https?:\/\/[^\s)<>"']*jobs\.feed\.json[^\s)<>"']*/i)
  if (absolute) return absolute[0].replace(/[.,)]$/, "")
  if (/jobs\.feed\.json/i.test(text)) {
    try {
      return new URL("/jobs.feed.json", base).toString()
    } catch {
      return null
    }
  }
  return null
}

export function parseJobFeed(
  body: string,
  opts: { companyName: string; boardId: string; sourceType: SourceType; feedUrl?: string }
): ListedJob[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return []
  }
  const found: JsonRecord[] = []
  walk(parsed, found)
  const jobs: ListedJob[] = []
  const seen = new Set<string>()
  for (const job of found) {
    const title = textValue(job.title) || textValue(job.name)
    const url = textValue(job.url)
    if (!title || !url) continue
    if (opts.feedUrl && url === opts.feedUrl) continue
    if (seen.has(url)) continue
    seen.add(url)
    const description =
      typeof job.description === "string" ? excerpt(htmlToText(job.description)) : undefined
    const listed = buildListedJob({
      externalId: textValue(job.identifier),
      title,
      companyName: textValue(asRecord(job.hiringOrganization)?.name) || opts.companyName,
      locationText: locationText(job.jobLocation),
      employmentType: textValue(job.employmentType),
      descriptionText: description,
      publishedAt: asDate(job.datePosted),
      originalUrl: url,
      sourceType: opts.sourceType,
      sourceBoardId: opts.boardId,
      needsHydration: false,
    })
    if (listed) jobs.push(listed)
  }
  return jobs
}
