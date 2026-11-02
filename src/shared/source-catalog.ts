import type { SourceType } from "./schemas"

/**
 * Every job source the product knows, including the ones it refuses to read.
 * connected: an adapter reads it. unverified: an adapter exists, never run on a live board.
 * partial: titles only. link_only: outbound links, never downloaded. banned: terms or robots forbid it.
 */
export type CatalogState = "connected" | "at_risk" | "unverified" | "partial" | "link_only" | "banned"

export type CatalogEntry = {
  name: string
  state: CatalogState
  sourceType?: SourceType
  note?: { pl: string; en: string }
}

const live = (name: string, sourceType: SourceType): CatalogEntry => ({ name, sourceType, state: "connected" })
const untested = (name: string, sourceType: SourceType): CatalogEntry => ({
  name,
  sourceType,
  state: "unverified",
  note: { pl: "Brak firmy do testu na żywo.", en: "No live board to test on yet." },
})
const say = (pl: string, en: string) => ({ pl, en })
const banned = (name: string, pl: string, en: string): CatalogEntry => ({ name, state: "banned", note: say(pl, en) })
const boardNote = say("Regulamin zabrania pobierania. Tylko link wychodzący.", "Terms forbid downloading. Outbound link only.")
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
    note: say("Same tytuły. Strona oferty działa tylko w JavaScript.", "Titles only. The offer page needs JavaScript."),
  },
  untested("Jobvite", "JOBVITE"),
  untested("Homerun", "HOMERUN"),
  untested("Polymer", "POLYMER"),
  untested("TalentLyft", "TALENTLYFT"),
  board("justjoin.it"),
  board("No Fluff Jobs"),
  board("pracuj.pl"),
  board("theprotocol.it"),
  board("Bulldogjob"),
  board("LinkedIn"),
  banned("Oracle Recruiting Cloud", "Regulamin Oracle zabrania robotów.", "Oracle's terms ban robots."),
  banned("Taleo", "Regulamin Oracle zabrania robotów.", "Oracle's terms ban robots."),
  banned("iCIMS", "Regulamin iCIMS zabrania robotów.", "iCIMS terms ban robots."),
  banned("JOIN", "Regulamin zabrania automatycznego dostępu.", "Terms ban automated access."),
  banned("HiBob", "Regulamin zabrania scrapowania.", "Terms ban scraping."),
  banned("PeopleForce", "robots.txt zabrania wszystkim robotom.", "robots.txt disallows every crawler."),
  banned("Welcome to the Jungle", "Regulamin zabrania scrapowania.", "Terms ban scraping."),
  banned("Wellfound", "Regulamin zabrania scrapowania.", "Terms ban scraping."),
  banned("Radancy", "robots.txt zabrania wyszukiwarki ofert.", "robots.txt disallows the job search."),
]
