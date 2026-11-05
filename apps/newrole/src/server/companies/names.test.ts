import { describe, expect, it } from "vitest"
import {
  companyNameKey,
  compareCompanies,
  identifyCompany,
  isPlatformName,
  readCompanyName,
} from "./names"

const compare = (a: string, b: string, map?: Map<string, string[]>) =>
  compareCompanies(identifyCompany(a, map), identifyCompany(b, map))

describe("readCompanyName", () => {
  it.each([
    ["Careers at Tide", "Tide"],
    ["Wolt - English", "Wolt"],
    ["Swift Harbor Solutions - Executive & Direct Search Services", "Swift Harbor Solutions"],
    ["Exadel (acquired Codete)", "Exadel"],
    ["Samsung (incl. SRPOL)", "Samsung"],
    ["Vodeno (Aion)", "Vodeno"],
    ["Coca-Cola", "Coca-Cola"],
    ["Acme Careers", "Acme"],
    ["Praca w Acme", "Acme"],
  ])("reads %j", (raw, main) => {
    expect(readCompanyName(raw)).toBe(main)
  })

  it("keeps a name that is nothing but what would be cut", () => {
    expect(readCompanyName("Careers")).toBe("Careers")
  })
})

describe("companyNameKey", () => {
  it("gives one key for the spellings of a name", () => {
    for (const name of [
      "Acme",
      "ACME",
      "Acme Sp. z o.o.",
      "Acme sp z o o",
      "Acme S.A.",
      "Acme Polska",
      "Acme Poland Sp. z o.o.",
      "Acme GmbH",
      "Acme, Inc.",
      "Acme Group",
      "Grupa Acme",
      "Careers at Acme",
      "Acme - English",
      "Acme (Remote)",
      "Acme (incl. Other)",
    ]) {
      expect([name, companyNameKey(name)]).toEqual([name, "acme"])
    }
  })

  it("squeezes what an ATS slug turns into words", () => {
    expect(companyNameKey("Capital.com")).toBe(companyNameKey("Capital Com"))
    expect(companyNameKey("capital-com")).toBe(companyNameKey("Capital.com"))
    expect(companyNameKey("Żabka Group")).toBe("zabka")
  })

  it("has nothing for a name that is only a legal form", () => {
    expect(companyNameKey("Sp. z o.o.")).toBe("")
    expect(companyNameKey("")).toBe("")
  })
})

describe("isPlatformName", () => {
  it("catches the site given as the company", () => {
    expect(isPlatformName("LinkedIn", "https://www.linkedin.com/feed/")).toBe(true)
    expect(isPlatformName("BambooHR", "https://zefirex.bamboohr.com/careers/115")).toBe(true)
    expect(isPlatformName("Pracuj.pl", "https://www.pracuj.pl/praca/x,oferta,1")).toBe(true)
    expect(isPlatformName("eRecruiter", "https://skk.erecruiter.pl/Offer.aspx?oid=1")).toBe(true)
  })

  it("lets the platform apply as an employer through another site", () => {
    expect(isPlatformName("LinkedIn", "https://boards.greenhouse.io/linkedin/jobs/1")).toBe(false)
    expect(isPlatformName("LinkedIn")).toBe(false)
  })

  it("leaves real companies alone", () => {
    expect(isPlatformName("Zefirex", "https://zefirex.bamboohr.com/careers/115")).toBe(false)
    expect(isPlatformName("OLX", "https://jobs.eu.lever.co/olx/5827")).toBe(false)
  })
})

describe("compareCompanies", () => {
  it("sees one company in two spellings", () => {
    expect(compare("Techland S.A.", "Techland")).toBe("same")
    expect(compare("Careers at Tide", "Tide")).toBe("same")
    expect(compare("Swift Harbor Solutions - Executive & Direct", "Swift Harbor Solutions")).toBe(
      "same"
    )
  })

  it("takes no bracket for a second company, only the map can say that", () => {
    expect(compare("Mangopay (incl. Nethone)", "Nethone")).toBe(null)
    expect(compare("Vodeno (Aion)", "Aion")).toBe(null)
    const map = new Map([
      ["codete", ["c_exadel"]],
      ["exadel", ["c_exadel"]],
    ])
    expect(compare("Exadel (acquired Codete)", "Codete", map)).toBe("same")
  })

  it("sees what only the map knows", () => {
    const map = new Map([
      ["livechatsoftware", ["c_text"]],
      ["text", ["c_text"]],
    ])
    expect(compare("LiveChat Software", "Text S.A.")).toBe(null)
    expect(compare("LiveChat Software", "Text S.A.", map)).toBe("same")
  })

  it("joins two index rows through the row they both map to", () => {
    const map = new Map([
      ["epam", ["c_epam"]],
      ["epamsystems", ["c_epam_systems", "c_epam"]],
    ])
    expect(compare("EPAM Systems", "EPAM", map)).toBe("same")
  })

  it("takes the company of the indexed offer as proof", () => {
    const map = new Map([["olx", ["c_olx"]]])
    const offer = identifyCompany("OLX", map)
    const application = identifyCompany("Grupa Tablica", map, "c_olx")
    expect(compareCompanies(offer, application)).toBe("same")
  })

  it("calls a name that opens another only similar", () => {
    expect(compare("Swift Harbor", "Swift Harbor Solutions")).toBe("similar")
    expect(compare("Ocado Technology", "Ocado")).toBe("similar")
    expect(compare("Motorola Solutions", "Motorola Mobility")).toBe(null)
    expect(compare("Allegro.pl", "Allegro")).toBe("similar")
  })

  it("does not build on a word too short to mean a company", () => {
    expect(compare("Box Solutions", "Box")).toBe(null)
    expect(compare("Fly Health", "Fly")).toBe(null)
  })

  it("keeps different companies apart", () => {
    expect(compare("Acme", "Globex")).toBe(null)
    expect(compare("Sumo Logic", "Sumo Digital")).toBe(null)
    expect(compare("Sp. z o.o.", "S.A.")).toBe(null)
  })
})
