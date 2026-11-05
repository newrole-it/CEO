import { createSafeFetch, httpClientOf, type HttpClient } from "@newrole/offers/http"
import { reserveHostSlot } from "src/server/fetch/host-pace"
import { fetchUserAgent } from "src/server/fetch/user-agent"

/**
 * newrole.it's outside requests: @newrole/offers/http with this app's User-Agent and a pace shared
 * through Postgres by the web app and the MCP server (host-pace.ts). Tests pace in memory.
 */

export type { HttpClient, HttpResponse } from "@newrole/offers/http"
export { noteHostInterval, pinnedLookup } from "@newrole/offers/http"

export const safeFetch = createSafeFetch({
  userAgent: fetchUserAgent,
  reserveSlot: (host, intervalMs) =>
    process.env.VITEST ? Promise.resolve(null) : reserveHostSlot(host, intervalMs),
})

export function createHttpClient(): HttpClient {
  return httpClientOf(safeFetch)
}
