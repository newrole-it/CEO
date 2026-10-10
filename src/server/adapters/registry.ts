import type { HttpClient } from "src/server/security/safe-fetch"
import type { SourceType } from "src/shared/schemas"
import { listAshby } from "./ashby"
import { hydrateBamboo, listBamboo } from "./bamboohr"
import { hydrateBreezy, listBreezy } from "./breezy"
import { hydrateGreenhouse, listGreenhouse } from "./greenhouse"
import { listLever } from "./lever"
import { listPersonio } from "./personio"
import { listPinpoint } from "./pinpoint"
import { listRecruitee } from "./recruitee"
import { hydrateSmartRecruiters, listSmartRecruiters } from "./smartrecruiters"
import { listTeamtailor } from "./teamtailor"
import { listTraffit } from "./traffit"
import type { BoardList } from "./types"
import { PLANNED_ATS, UNDOCUMENTED_ATS } from "./types"
import { hydrateWorkable, listWorkable } from "./workable"

export { PLANNED_ATS, UNDOCUMENTED_ATS }
export type { BoardList }

export type LiveAts = Exclude<SourceType, "GENERIC_HTML" | "WEB_SEARCH">

type Adapter = {
  sourceType: LiveAts
  status: "live"
  list: (boardId: string, http: HttpClient, companyName?: string) => Promise<BoardList>
  hydrate?: (
    job: import("src/shared/schemas").ListedJob,
    http: HttpClient
  ) => Promise<import("src/shared/schemas").ListedJob>
}

export const adapters: Adapter[] = [
  { sourceType: "GREENHOUSE", status: "live", list: listGreenhouse, hydrate: hydrateGreenhouse },
  { sourceType: "LEVER", status: "live", list: listLever, hydrate: undefined },
  { sourceType: "ASHBY", status: "live", list: listAshby, hydrate: undefined },
  { sourceType: "WORKABLE", status: "live", list: listWorkable, hydrate: hydrateWorkable },
  {
    sourceType: "SMARTRECRUITERS",
    status: "live",
    list: listSmartRecruiters,
    hydrate: hydrateSmartRecruiters,
  },
  { sourceType: "TRAFFIT", status: "live", list: listTraffit, hydrate: undefined },
  { sourceType: "RECRUITEE", status: "live", list: listRecruitee, hydrate: undefined },
  { sourceType: "TEAMTAILOR", status: "live", list: listTeamtailor, hydrate: undefined },
  { sourceType: "PERSONIO", status: "live", list: listPersonio, hydrate: undefined },
  { sourceType: "PINPOINT", status: "live", list: listPinpoint, hydrate: undefined },
  { sourceType: "BREEZY", status: "live", list: listBreezy, hydrate: hydrateBreezy },
  { sourceType: "BAMBOOHR", status: "live", list: listBamboo, hydrate: hydrateBamboo },
]

export function adapterFor(provider: LiveAts): Adapter {
  const found = adapters.find((item) => item.sourceType === provider)
  if (!found) throw new Error(`No adapter for ${provider}`)
  return found
}
