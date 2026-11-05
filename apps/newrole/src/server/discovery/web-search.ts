import type { HttpClient } from "src/server/security/safe-fetch"
import { claudeSearch, claudeSearchEnabled } from "./claude-search"

export type SearchProviderName = "brave" | "serper" | "claude" | "none"

export type WebHit = { url: string; title?: string; snippet?: string }

type SearchResult = { provider: SearchProviderName; hits: WebHit[] }

/** Which search API would run. The key itself is never returned. */
export function searchProvider(): { configured: boolean; provider: SearchProviderName } {
  if (process.env.BRAVE_SEARCH_API_KEY?.trim()) return { configured: true, provider: "brave" }
  if (process.env.SERPER_API_KEY?.trim()) return { configured: true, provider: "serper" }
  if (claudeSearchEnabled()) return { configured: true, provider: "claude" }
  return { configured: false, provider: "none" }
}

/**
 * Brave is primary. Serper runs when Brave is unset or a Brave call fails.
 * Claude (`claude -p` with WebSearch, daily-capped) runs only when both keys are missing.
 * The provider payload is not stored. Callers may keep a derived job: title,
 * company, canonical URL, a short excerpt, and a parsed salary.
 */
export async function searchWeb(query: string, _http: HttpClient): Promise<SearchResult> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  const serperKey = process.env.SERPER_API_KEY?.trim()
  if (braveKey) {
    try {
      return { provider: "brave", hits: await braveSearch(query, braveKey) }
    } catch (error) {
      if (!serperKey) throw error
    }
  }
  if (serperKey) return { provider: "serper", hits: await serperSearch(query, serperKey) }
  if (claudeSearchEnabled()) return { provider: "claude", hits: await claudeSearch(query) }
  return { provider: "none", hits: [] }
}

export function hitsFromBravePayload(payload: unknown): WebHit[] {
  const results = asResults(payload, ["web", "results"])
  return results.flatMap((result) => {
    const url = stringField(result, "url")
    if (!url) return []
    return [
      { url, title: stringField(result, "title"), snippet: stringField(result, "description") },
    ]
  })
}

export function hitsFromSerperPayload(payload: unknown): WebHit[] {
  const results = asResults(payload, ["organic"])
  return results.flatMap((result) => {
    const url = stringField(result, "link")
    if (!url) return []
    return [{ url, title: stringField(result, "title"), snippet: stringField(result, "snippet") }]
  })
}

async function braveSearch(query: string, key: string): Promise<WebHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
    query
  )}&count=10`
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": key },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`)
  return hitsFromBravePayload(await response.json())
}

async function serperSearch(query: string, key: string): Promise<WebHit[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-KEY": key },
    body: JSON.stringify({ q: query, num: 10 }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Serper returned ${response.status}`)
  return hitsFromSerperPayload(await response.json())
}

function asResults(payload: unknown, path: string[]): Record<string, unknown>[] {
  let cursor: unknown = payload
  for (const key of path) {
    if (!cursor || typeof cursor !== "object") return []
    cursor = (cursor as Record<string, unknown>)[key]
  }
  if (!Array.isArray(cursor)) return []
  return cursor.filter(
    (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object"
  )
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}
