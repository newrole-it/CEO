import type {HttpClient} from "src/server/security/safe-fetch"

export type WebHit = {url: string}

type SearchResult = {provider: "brave" | "serper" | "none"; hits: WebHit[]}

/**
 * Brave is the primary discovery provider. Serper is the fallback when Brave
 * is not configured or the Brave call fails. Hits stay in memory only: Brave's
 * terms forbid storing search results. Callers may keep derived ATS slugs
 * after the ATS API confirms them.
 */
export async function searchWeb(query: string, _http: HttpClient): Promise<SearchResult> {
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim()
  const serperKey = process.env.SERPER_API_KEY?.trim()
  if (braveKey) {
    try {
      return {provider: "brave", hits: await braveSearch(query, braveKey)}
    } catch (error) {
      if (!serperKey) throw error
    }
  }
  if (serperKey) return {provider: "serper", hits: await serperSearch(query, serperKey)}
  return {provider: "none", hits: []}
}

async function braveSearch(query: string, key: string): Promise<WebHit[]> {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`
  const response = await fetch(url, {
    headers: {Accept: "application/json", "X-Subscription-Token": key},
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Brave Search returned ${response.status}`)
  const payload = (await response.json()) as {web?: {results?: Array<{url?: string}>}}
  return (payload.web?.results ?? []).flatMap((result) => (result.url ? [{url: result.url}] : []))
}

async function serperSearch(query: string, key: string): Promise<WebHit[]> {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {"Content-Type": "application/json", "X-API-KEY": key},
    body: JSON.stringify({q: query, num: 10}),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Serper returned ${response.status}`)
  const payload = (await response.json()) as {organic?: Array<{link?: string}>}
  return (payload.organic ?? []).flatMap((result) => (result.link ? [{url: result.link}] : []))
}
