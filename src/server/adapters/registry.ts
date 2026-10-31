import type { HttpClient } from "src/server/security/safe-fetch"
import type { SourceType } from "src/shared/schemas"
import { listAshby } from "./ashby"
import { hydrateAvature, listAvature } from "./avature"
import { hydrateBamboo, listBamboo } from "./bamboohr"
import { hydrateCareer, listCareerSite } from "./career-site"
import { hydrateBreezy, listBreezy } from "./breezy"
import { hydrateErecruiter, listErecruiter } from "./erecruiter"
import { hydrateGreenhouse, listGreenhouse } from "./greenhouse"
import { htmlLister, hydrateHtmlJob } from "./html-boards"
import * as boards from "./json-boards"
import { hydrateJobvite, listJobvite } from "./jobvite"
import { listLever } from "./lever"
import { listPersonio } from "./personio"
import { hydratePhenom, listPhenom } from "./phenom"
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
  { sourceType: "ERECRUITER", status: "live", list: listErecruiter, hydrate: hydrateErecruiter },
  { sourceType: "PHENOM", status: "live", list: listPhenom, hydrate: hydratePhenom },
  { sourceType: "AVATURE", status: "live", list: listAvature, hydrate: hydrateAvature },
  { sourceType: "JOBVITE", status: "live", list: listJobvite, hydrate: hydrateJobvite },
  { sourceType: "EIGHTFOLD", status: "live", list: boards.listEightfold, hydrate: boards.hydrateEightfold },
  { sourceType: "SOFTGARDEN", status: "live", list: boards.listSoftgarden, hydrate: undefined },
  { sourceType: "BULLHORN", status: "live", list: boards.listBullhorn, hydrate: undefined },
  { sourceType: "ZOHO_RECRUIT", status: "live", list: boards.listZoho, hydrate: undefined },
  { sourceType: "RIPPLING", status: "live", list: boards.listRippling, hydrate: boards.hydrateRippling },
  { sourceType: "GEM", status: "live", list: boards.listGem, hydrate: undefined },
  { sourceType: "DOVER", status: "live", list: boards.listDover, hydrate: boards.hydrateDover },
  { sourceType: "POLYMER", status: "live", list: boards.listPolymer, hydrate: boards.hydratePolymer },
  { sourceType: "COMEET", status: "live", list: boards.listComeet, hydrate: undefined },
  { sourceType: "HOMERUN", status: "live", list: boards.listHomerun, hydrate: undefined },
  { sourceType: "DVINCI", status: "live", list: boards.listDvinci, hydrate: undefined },
  { sourceType: "MANATAL", status: "live", list: boards.listManatal, hydrate: undefined },
  { sourceType: "ONLYFY", status: "live", list: htmlLister("ONLYFY"), hydrate: hydrateHtmlJob },
  { sourceType: "REXX", status: "live", list: htmlLister("REXX"), hydrate: hydrateHtmlJob },
  { sourceType: "JAZZHR", status: "live", list: htmlLister("JAZZHR"), hydrate: hydrateHtmlJob },
  { sourceType: "CATSONE", status: "live", list: htmlLister("CATSONE"), hydrate: hydrateHtmlJob },
  { sourceType: "LOXO", status: "live", list: htmlLister("LOXO"), hydrate: hydrateHtmlJob },
  { sourceType: "TALENTLYFT", status: "live", list: htmlLister("TALENTLYFT"), hydrate: hydrateHtmlJob },
  { sourceType: "FACTORIAL", status: "live", list: htmlLister("FACTORIAL"), hydrate: hydrateHtmlJob },
  { sourceType: "SUCCESSFACTORS", status: "live", list: listCareerSite, hydrate: hydrateCareer },
  { sourceType: "WORKDAY", status: "live", list: listCareerSite, hydrate: hydrateCareer },
  { sourceType: "CAREER_SITE", status: "live", list: listCareerSite, hydrate: hydrateCareer },
]

export function adapterFor(provider: LiveAts): Adapter {
  const found = adapters.find((item) => item.sourceType === provider)
  if (!found) throw new Error(`No adapter for ${provider}`)
  return found
}
