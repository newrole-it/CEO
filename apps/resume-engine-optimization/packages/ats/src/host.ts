import { createSafeFetch, httpClientOf, type HttpClient } from "@newrole/offers/http"
import type { ListedJob, SourceType } from "./schemas"

export type { HttpClient, HttpResponse } from "@newrole/offers/http"
export { noteHostInterval } from "@newrole/offers/http"

/** Job-detail pages read from one host per UTC day; the /bot page of each app promises it. */
export const DETAIL_DAILY_CAP = 200

/**
 * What the readers take from the app that runs them. @newrole/ats keeps no data: the User-Agent and
 * the per-host pace are the app's HTTP client's, the daily cap of detail pages is counted where the
 * app keeps it (newrole.it: Postgres CrawlBudget), and an index may give back a career site's
 * offers it read in full within a day instead of reading the site again.
 */
export type AtsHost = {
  /** A new HTTP client: SSRF-safe, paced per host, with the app's User-Agent. */
  http: () => HttpClient
  /** One more detail page from `host` today, or false once the cap is used. */
  takeDetailSlot: (host: string) => Promise<boolean>
  /** Detail pages still allowed from `host` today. */
  detailFetchesRemaining: (host: string) => Promise<number>
  /** A career site's offers as an index last read them in full, within a day; null to read again. */
  cachedCareerListing: (target: {
    provider: SourceType
    boardId: string
    companyName: string
  }) => Promise<ListedJob[] | null>
}

/** The cap counted in this process only: right for one process, tests and a harvest run. */
export function memoryDetailBudget(cap: number = DETAIL_DAILY_CAP): {
  take: (host: string) => Promise<boolean>
  remaining: (host: string) => Promise<number>
} {
  const counts = new Map<string, { day: string; count: number }>()
  const today = () => new Date().toISOString().slice(0, 10)
  return {
    async take(host) {
      const day = today()
      const current = counts.get(host)
      if (!current || current.day !== day) {
        counts.set(host, { day, count: 1 })
        return true
      }
      if (current.count >= cap) return false
      current.count += 1
      return true
    },
    async remaining(host) {
      const current = counts.get(host)
      if (!current || current.day !== today()) return cap
      return Math.max(0, cap - current.count)
    },
  }
}

const DEFAULT_USER_AGENT =
  "NewRoleBot/0.1 (+https://newrole.it/bot; personal non-commercial job search)"

function defaults(): AtsHost {
  const budget = memoryDetailBudget()
  return {
    http: () => httpClientOf(createSafeFetch({ userAgent: () => DEFAULT_USER_AGENT })),
    takeDetailSlot: budget.take,
    detailFetchesRemaining: budget.remaining,
    cachedCareerListing: async () => null,
  }
}

let current: AtsHost = defaults()

/** Called once by the app at start; what it leaves out keeps the in-memory default. */
export function configureAts(next: Partial<AtsHost>): void {
  current = { ...current, ...next }
}

/** Back to the defaults, for tests. */
export function resetAts(): void {
  current = defaults()
}

export function atsHost(): AtsHost {
  return current
}

export function createHttpClient(): HttpClient {
  return current.http()
}

export function takeDetailSlot(host: string): Promise<boolean> {
  return current.takeDetailSlot(host)
}

export function detailFetchesRemaining(host: string): Promise<number> {
  return current.detailFetchesRemaining(host)
}
