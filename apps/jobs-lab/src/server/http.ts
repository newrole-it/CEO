import { configureAts } from "@newrole/ats/host"
import { createSafeFetch, httpClientOf, type HttpClient } from "@newrole/offers/http"

/**
 * The lab reads as newrole.it does: SSRF-safe, one request per second per host (paced in this
 * process), robots.txt where pages are read, and the 200-a-day cap of detail pages kept in memory
 * (@newrole/ats's default). The User-Agent says it is the engine's test bench.
 */
export function labUserAgent(): string {
  const note = process.env.CRAWLER_NOTE?.trim() || "newrole.it engine test bench"
  const site = (process.env.APP_URL?.trim() || "https://newrole.it").replace(/\/$/, "")
  return `NewRoleBot/0.1 (+${site}/bot; ${note})`
}

const safeFetch = createSafeFetch({ userAgent: labUserAgent })

export function labHttp(): HttpClient {
  return httpClientOf(safeFetch)
}

configureAts({ http: labHttp })
