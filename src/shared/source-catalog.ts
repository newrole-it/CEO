import type { SourceType } from "./schemas"

/**
 * Every job source the product shows on the sources page.
 * connected: an adapter reads it. partial: titles only. link_only: outbound links, never downloaded.
 */
export type CatalogState = "connected" | "at_risk" | "partial" | "link_only"

export type CatalogEntry = {
  name: string
  state: CatalogState
  sourceType?: SourceType
  note?: { pl: string; en: string }
}

const live = (name: string, sourceType: SourceType): CatalogEntry => ({
  name,
  sourceType,
  state: "connected",
})
const say = (pl: string, en: string) => ({ pl, en })
const boardNote = say(
  "Regulamin zabrania pobierania. Tylko link wychodzący.",
  "Terms forbid downloading. Outbound link only."
)
const board = (name: string): CatalogEntry => ({ name, state: "link_only", note: boardNote })

export const SOURCE_CATALOG: CatalogEntry[] = [
  live("Greenhouse", "GREENHOUSE"),
  live("Lever", "LEVER"),
  live("Ashby", "ASHBY"),
  live("Workable", "WORKABLE"),
  {
    name: "SmartRecruiters",
    sourceType: "SMARTRECRUITERS",
    state: "at_risk",
    note: say(
      "Polityka może się zmienić w każdym momencie.",
      "The policy may change at any moment."
    ),
  },
  live("Teamtailor", "TEAMTAILOR"),
  live("Recruitee", "RECRUITEE"),
  live("Traffit", "TRAFFIT"),
  live("Personio", "PERSONIO"),
  live("Pinpoint", "PINPOINT"),
  live("Breezy HR", "BREEZY"),
  live("BambooHR", "BAMBOOHR"),
  live("SuccessFactors", "SUCCESSFACTORS"),
  live("Workday", "WORKDAY"),
  live("Strony kariery firm / Career sites", "CAREER_SITE"),
  live("eRecruiter", "ERECRUITER"),
  live("Phenom", "PHENOM"),
  live("Avature", "AVATURE"),
  live("Eightfold", "EIGHTFOLD"),
  live("softgarden", "SOFTGARDEN"),
  live("Bullhorn", "BULLHORN"),
  live("Zoho Recruit", "ZOHO_RECRUIT"),
  live("Rippling", "RIPPLING"),
  live("Gem", "GEM"),
  live("Dover", "DOVER"),
  live("Comeet", "COMEET"),
  live("d.vinci", "DVINCI"),
  live("Manatal", "MANATAL"),
  live("onlyfy", "ONLYFY"),
  live("rexx", "REXX"),
  live("JazzHR", "JAZZHR"),
  live("CATS", "CATSONE"),
  live("Factorial", "FACTORIAL"),
  {
    name: "Loxo",
    sourceType: "LOXO",
    state: "partial",
    note: say(
      "Same tytuły. Strona oferty działa tylko w JavaScript.",
      "Titles only. The offer page needs JavaScript."
    ),
  },
  board("justjoin.it"),
  board("No Fluff Jobs"),
  board("pracuj.pl"),
  board("theprotocol.it"),
  board("Bulldogjob"),
  board("LinkedIn"),
]
