import type { ListedJob } from "src/shared/schemas"

export type BoardList = {
  jobs: ListedJob[]
  proven: boolean
  companyName?: string
  /** A company name the platform itself published, when the adapter read one apart from the caller's. */
  publishedName?: string
  note?: string
  /** URLs or postings the source reported, including ones already stored. */
  listedCount?: number
  /** True when this response is the full current inventory, not a daily-cap slice. */
  complete?: boolean
  /** True when the per-host detail cap stopped the crawl before the inventory ended. */
  budgetExhausted?: boolean
  /** Canonical URLs still on the source. Set when `complete` is true. */
  coveredUrls?: string[]
}

/**
 * Byte cap for one platform list call. Large boards run past 8 MB: measured on 2026-11-03,
 * Recruitee dpgmedia 41.2 MB, Ashby bjakcareer 33.9 MB, Greenhouse pulse 21.1 MB,
 * Lever paytmpayments 13.8 MB and veeva 12.1 MB, Workable huzzle 11.1 MB.
 */
export const LIST_MAX_BYTES = 48_000_000

/**
 * boards-api.eu.greenhouse.io has no DNS record (NXDOMAIN on 2026-10-31, also via 1.1.1.1),
 * and the official Job Board API docs name no EU host. EU-hosted boards render at
 * job-boards.eu.greenhouse.io/{token}; their API host is unknown. Do not call this endpoint.
 */
export const PLANNED_ATS = [
  {
    id: "greenhouse-eu",
    status: "unverified" as const,
    endpoint: "https://boards-api.eu.greenhouse.io/v1/boards/{token}/jobs",
    note: "UNVERIFIED. The host does not exist in DNS (2026-10-31). EU boards live at job-boards.eu.greenhouse.io/{token}. Not called.",
  },
]

/** Live but undocumented. Official APIs for these vendors need an employer key. */
export const UNDOCUMENTED_ATS = [
  {
    id: "breezy",
    endpoint: "https://{company}.breezy.hr/json",
    note: "Undocumented. The official Breezy API is authenticated. Used because verified seed boards publish this feed.",
  },
  {
    id: "bamboohr",
    endpoint: "https://{company}.bamboohr.com/careers/list",
    note: "Undocumented. The official BambooHR API needs a key. The list has no description; detail is fetched for matches.",
  },
]
