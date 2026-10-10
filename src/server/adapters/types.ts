import type { ListedJob } from "src/shared/schemas"

export type BoardList = {
  jobs: ListedJob[]
  proven: boolean
  companyName?: string
  note?: string
}

/**
 * Greenhouse EU was unreachable on 2026-10-10 (TLS hang / HTTP 500).
 * Do not call boards-api.eu.greenhouse.io.
 */
export const PLANNED_ATS = [
  {
    id: "greenhouse-eu",
    status: "unverified" as const,
    endpoint: "https://boards-api.eu.greenhouse.io/v1/boards/{token}/jobs",
    note: "UNVERIFIED. The EU Greenhouse host did not answer on 2026-10-10. Not called.",
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
