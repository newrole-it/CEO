/** schema.org JobPosting in a page's JSON-LD blocks, and the values inside it. */

export type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown): JsonRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as JsonRecord
}

function typeIncludesJob(value: unknown): boolean {
  if (typeof value === "string") return value === "JobPosting" || value.endsWith("/JobPosting")
  if (Array.isArray(value)) return value.some((item) => typeIncludesJob(item))
  return false
}

export function textValue(value: unknown): string | undefined {
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
export function identifierValue(value: unknown): string | undefined {
  const record = asRecord(value)
  if (record && (typeof record.value === "string" || typeof record.value === "number")) {
    const id = String(record.value).trim()
    if (id) return id
  }
  return textValue(value)
}

export function locationText(value: unknown): string | undefined {
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

export function salaryFrom(value: unknown): { min?: number; max?: number; currency?: string } {
  const record = asRecord(value)
  if (!record) return {}
  const currency = typeof record.currency === "string" ? record.currency : undefined
  const quantitative = asRecord(record.value) ?? record
  const min = numberValue(quantitative.minValue ?? quantitative.value)
  const max = numberValue(quantitative.maxValue ?? quantitative.value)
  return { min, max, currency }
}

export function numberValue(value: unknown): number | undefined {
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

/** Every JobPosting in the page's JSON-LD blocks (top level, arrays, @graph), in page order. */
export function jobPostingNodes(html: string): JsonRecord[] {
  const blocks = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  )
  const found: JsonRecord[] = []
  for (const block of blocks) {
    let parsed: unknown
    try {
      parsed = JSON.parse(block[1].trim())
    } catch {
      continue
    }
    walk(parsed, found)
  }
  return found
}
