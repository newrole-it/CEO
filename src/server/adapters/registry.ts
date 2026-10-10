import type {HttpClient} from "src/server/security/safe-fetch"
import type {SourceType} from "src/shared/schemas"
import {listAshby} from "./ashby"
import {hydrateGreenhouse, listGreenhouse} from "./greenhouse"
import {listLever} from "./lever"
import {hydrateSmartRecruiters, listSmartRecruiters} from "./smartrecruiters"
import type {BoardList} from "./types"
import {PLANNED_ATS} from "./types"
import {hydrateWorkable, listWorkable} from "./workable"

export {PLANNED_ATS}
export type {BoardList}

export type LiveAts = Exclude<SourceType, "GENERIC_HTML" | "WEB_SEARCH">

type Adapter = {
  sourceType: LiveAts
  status: "live"
  list: (boardId: string, http: HttpClient, companyName?: string) => Promise<BoardList>
  hydrate?: (job: import("src/shared/schemas").ListedJob, http: HttpClient) => Promise<import("src/shared/schemas").ListedJob>
}

export const adapters: Adapter[] = [
  {sourceType: "GREENHOUSE", status: "live", list: listGreenhouse, hydrate: hydrateGreenhouse},
  {sourceType: "LEVER", status: "live", list: listLever, hydrate: undefined},
  {sourceType: "ASHBY", status: "live", list: listAshby, hydrate: undefined},
  {sourceType: "WORKABLE", status: "live", list: listWorkable, hydrate: hydrateWorkable},
  {sourceType: "SMARTRECRUITERS", status: "live", list: listSmartRecruiters, hydrate: hydrateSmartRecruiters},
]

export function adapterFor(provider: LiveAts): Adapter {
  const found = adapters.find((item) => item.sourceType === provider)
  if (!found) throw new Error(`No adapter for ${provider}`)
  return found
}
