import { describe, expect, it } from "vitest"
import {
  companyKeys,
  compareCompanies,
  identifyCompany,
  isPlatformName,
  readCompanyName,
} from "./names"

const compare = (a: string, b: string, map?: Map<string, string[]>) =>
  compareCompanies(identifyCompany(a, map), identifyCompany(b, map))

describe("readCompanyName", () => {
  it.each([
    ["Careers at Tide", "Tide", []],
    ["Wolt - English", "Wolt", []],
    ["Fast Forward Solutions - Executive & Direct Search Services", "Fast Forward Solutions", []],
    ["Exadel (acquired Codete)", "Exadel", ["Codete"]],
    ["Samsung (incl. SRPOL)", "Samsung", ["SRPOL"]],
    ["Vodeno (Aion)", "Vodeno", ["Aion"]],
    ["Coca-Cola", "Coca-Cola", []],
    ["Acme Careers", "Acme", []],
    ["Praca w Acme", "Acme", []],
  ])("reads %j", (raw, main, also) => {
    expect(readCompanyName(raw)).toEqual({ main, also })
  })

  it("keeps a name that is nothing but what would be cut", () => {
    expect(readCompanyName("Careers").main).toBe("Careers")
  })
})

describe("companyKeys", () => {
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
    ]) {
      expect([name, companyKeys(name)]).toEqual([name, ["acme"]])
    }
  })

  it("squeezes what an ATS slug turns into words", () => {
    expect(companyKeys("Capital.com")).toEqual(companyKeys("Capital Com"))
    expect(companyKeys("capital-com")).toEqual(companyKeys("Capital.com"))
    expect(companyKeys("Żabka Group")).toEqual(["zabka"])
  })

  it("adds the second name, unless the bracket only says where", () => {
    expect(companyKeys("Exadel (acquired by Codete)")).toEqual(["exadel", "codete"])
    expect(companyKeys("Acme (Remote)")).toEqual(["acme"])
    expect(companyKeys("Acme (Polska)")).toEqual(["acme"])
  })

  it("has nothing for a name that is only a legal form", () => {
    expect(companyKeys("Sp. z o.o.")).toEqual([])
    expect(companyKeys("")).toEqual([])
  })
})

describe("isPlatformName", () => {
  it("catches the site given as the company", () => {
    expect(isPlatformName("LinkedIn", "https://www.linkedin.com/feed/")).toBe(true)
    expect(isPlatformName("BambooHR", "https://sforbt.bamboohr.com/careers/115")).toBe(true)
    expect(isPlatformName("Pracuj.pl", "https://www.pracuj.pl/praca/x,oferta,1")).toBe(true)
  })

  it("lets the platform apply as an employer through another site", () => {
    expect(isPlatformName("LinkedIn", "https://boards.greenhouse.io/linkedin/jobs/1")).toBe(false)
    expect(isPlatformName("LinkedIn")).toBe(false)
  })

  it("leaves real companies alone", () => {
    expect(isPlatformName("Sforbt", "https://sforbt.bamboohr.com/careers/115")).toBe(false)
    expect(isPlatformName("OLX", "https://jobs.eu.lever.co/olx/5827")).toBe(false)
  })
})

describe("compareCompanies", () => {
  it("sees one company in two spellings", () => {
    expect(compare("Techland S.A.", "Techland")).toBe("same")
    expect(compare("Careers at Tide", "Tide")).toBe("same")
    expect(compare("Fast Forward Solutions - Executive & Direct", "Fast Forward Solutions")).toBe(
      "same"
    )
  })

  it("sees a second name", () => {
    expect(compare("Exadel (acquired Codete)", "Codete")).toBe("same")
  })

  it("sees what only the map knows", () => {
    const map = new Map([
      ["livechat", ["c_text"]],
      ["text", ["c_text"]],
    ])
    expect(compare("LiveChat", "Text S.A.")).toBe(null)
    expect(compare("LiveChat", "Text S.A.", map)).toBe("same")
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
    expect(compare("Fast Forward", "Fast Forward Solutions")).toBe("similar")
    expect(compare("Ocado Technology", "Ocado")).toBe("similar")
  })

  it("does not build on a word too short to mean a company", () => {
    expect(compare("Box Solutions", "Box")).toBe(null)
    expect(compare("Fly Health", "Fly")).toBe(null)
  })

  it("keeps different companies apart", () => {
    expect(compare("Acme", "Globex")).toBe(null)
    expect(compare("Sumo Logic", "Sumo Digital")).toBe(null)
    expect(compare("Allegro", "Allegro Pay Solutions")).toBe("similar")
    expect(compare("Sp. z o.o.", "S.A.")).toBe(null)
  })
})
