import { createSafeFetch, httpClientOf, type HttpClient } from "@newrole/offers/http"
import { reserveHostSlot } from "src/server/crawler/host-pace"
import { fetchUserAgent } from "src/server/crawler/hygiene"
import { harvestMode } from "src/server/harvest/mode"

/**
 * newrole.it's outside requests: @newrole/offers/http with this app's User-Agent and a pace shared
 * through Postgres by the web app, the worker and the MCP server (host-pace.ts). Tests and a
 * harvest run pace in memory.
 */

export type { HttpClient, HttpResponse } from "@newrole/offers/http"
export { noteHostInterval, pinnedLookup } from "@newrole/offers/http"

export const safeFetch = createSafeFetch({
  userAgent: fetchUserAgent,
  reserveSlot: (host, intervalMs) =>
    process.env.VITEST || harvestMode() ? Promise.resolve(null) : reserveHostSlot(host, intervalMs),
})

export function createHttpClient(): HttpClient {
  return httpClientOf(safeFetch)
}
