/**
 * One page read for the crawler or for a person: source policy, robots.txt, then the safe fetch
 * (http.ts), which adds URL safety, the size cap, and 1 s per host. Job boards, LinkedIn and
 * social sites are never crawled, but a person may have one offer of theirs read (Reader in
 * source-policies.ts). robots.txt and a login or bot wall stop both. Nothing is stored here.
 */
import { isAggregatorHost } from "./hosts"
import { noteHostInterval, type HttpClient, type HttpResponse } from "./http"
import { emptyRobots, parseRobots, robotsAllows, type RobotsRules } from "./robots"
import { decideFetch, type Reader } from "./source-policies"

export type { Reader }

export type PoliteResult =
  | { ok: true; response: HttpResponse }
  | { ok: false; reason: string; linkOnly: boolean }

export type RobotsCache = Map<string, { rules: RobotsRules; wall: string | null }>

export function createRobotsCache(): RobotsCache {
  return new Map()
}

/** Policy verdict without any network call. */
export function policyFor(
  raw: string,
  reader: Reader = "crawler"
): { allow: boolean; linkOnly: boolean; reason: string } {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { allow: false, linkOnly: false, reason: "Not a valid URL" }
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { allow: false, linkOnly: false, reason: "Only http and https links are read" }
  }
  if (reader === "crawler" && isAggregatorHost(url.hostname)) {
    return {
      allow: false,
      linkOnly: true,
      reason:
        "Job boards, LinkedIn, and social sites are never crawled. Use the company's own site.",
    }
  }
  const decision = decideFetch(url, reader)
  if (decision.state === "link_only") {
    return { allow: false, linkOnly: true, reason: `${decision.platform}: ${decision.reason}` }
  }
  if (!decision.allow) {
    return { allow: false, linkOnly: false, reason: `${decision.platform}: ${decision.reason}` }
  }
  return { allow: true, linkOnly: false, reason: decision.reason }
}

async function robotsFor(
  url: URL,
  http: HttpClient,
  cache: RobotsCache,
  reader: Reader
): Promise<{ rules: RobotsRules; wall: string | null }> {
  const key = `${url.protocol}//${url.host}`
  const cached = cache.get(key)
  if (cached) return cached
  let entry: { rules: RobotsRules; wall: string | null }
  try {
    const response = await http.get(`${key}/robots.txt`, {
      accept: "text/plain",
      maxBytes: 200_000,
      timeoutMs: 15_000,
      reader,
    })
    if ([401, 403, 503].includes(response.status)) {
      entry = {
        rules: emptyRobots(),
        wall: `robots.txt returned ${response.status}. Not bypassing a login or bot wall.`,
      }
    } else if (response.status >= 400) {
      entry = { rules: emptyRobots(), wall: null }
    } else {
      entry = { rules: parseRobots(response.body), wall: null }
    }
  } catch (error) {
    entry = {
      rules: emptyRobots(),
      wall: error instanceof Error ? error.message : "robots.txt could not be read",
    }
  }
  if (entry.rules.crawlDelaySec && entry.rules.crawlDelaySec > 5) {
    noteHostInterval(url.hostname, entry.rules.crawlDelaySec * 1000)
  }
  cache.set(key, entry)
  return entry
}

export async function politeGet(
  raw: string,
  http: HttpClient,
  cache: RobotsCache,
  opts?: { accept?: string; maxBytes?: number; reader?: Reader }
): Promise<PoliteResult> {
  const reader = opts?.reader ?? "crawler"
  const policy = policyFor(raw, reader)
  if (!policy.allow) return { ok: false, reason: policy.reason, linkOnly: policy.linkOnly }
  const url = new URL(raw)
  const robots = await robotsFor(url, http, cache, reader)
  if (robots.wall) return { ok: false, reason: robots.wall, linkOnly: true }
  if (!robotsAllows(robots.rules, `${url.pathname}${url.search}`)) {
    return { ok: false, reason: `robots.txt disallows ${url.pathname}`, linkOnly: true }
  }
  try {
    const response = await http.get(url.toString(), {
      accept: opts?.accept ?? "text/html,application/xhtml+xml",
      maxBytes: opts?.maxBytes ?? 1_500_000,
      timeoutMs: 15_000,
      reader,
    })
    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        reason: `${url.hostname} answered ${response.status}. Not bypassing a login or bot wall.`,
        linkOnly: true,
      }
    }
    if (response.status >= 400) {
      return { ok: false, reason: `${url.hostname} answered ${response.status}`, linkOnly: false }
    }
    return { ok: true, response }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Fetch failed",
      linkOnly: false,
    }
  }
}
