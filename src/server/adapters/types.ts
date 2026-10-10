import type {ListedJob} from "src/shared/schemas"

export type BoardList = {
  jobs: ListedJob[]
  proven: boolean
  companyName?: string
  note?: string
}

/** Public read APIs that are documented but were not probed. Do not call them yet. */
export const PLANNED_ATS = [
  {
    id: "teamtailor",
    status: "unverified" as const,
    endpoint: "https://{company}.teamtailor.com/jobs.json",
    note: "UNVERIFIED. The 2026-10-10 source pack did not probe Teamtailor.",
  },
  {
    id: "recruitee",
    status: "unverified" as const,
    endpoint: "https://{company}.recruitee.com/api/offers/",
    note: "UNVERIFIED. The 2026-10-10 source pack did not probe Recruitee.",
  },
  {
    id: "personio",
    status: "unverified" as const,
    endpoint: "https://{company}.jobs.personio.de/xml",
    note: "UNVERIFIED. The 2026-10-10 source pack did not probe Personio.",
  },
]
