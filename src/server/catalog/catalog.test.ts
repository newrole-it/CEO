import { describe, expect, it } from "vitest"
import type { BoardList } from "src/server/adapters/types"
import { candidatesFromYaml, parseBoardYaml, workdayBoardId } from "./freehire"
import { nextCatalogCheck } from "./run"
import { slugCandidates } from "./guess"
import {
  boardPageUrl,
  isGenericName,
  looksLikeJunkName,
  nameFromTitle,
  preferredName,
  workdayName,
} from "./verify"

const yaml = `# greenhouse boards. Provider is the filename; each entry is company + board.
- company: "Dragos, Inc."
  board: dragos
- company: '30th Street Animal Hospital '
  board: 30thstreet
- company: 12jlkfsk
  board: 12jlkfsk
- company: Bad Board
  board: "not a slug"
- company: Dragos again
  board: dragos
`

describe("freehire board files", () => {
  it("reads quoted and plain values", () => {
    const entries = parseBoardYaml(yaml)
    expect(entries[0]).toEqual({ company: "Dragos, Inc.", board: "dragos" })
    expect(entries[1].company).toBe("30th Street Animal Hospital ")
  })

  it("keeps valid, distinct board ids and turns Lever's EU region into eu:", () => {
    const boards = candidatesFromYaml("greenhouse", yaml)
    expect(boards.map((board) => board.providerBoardId)).toEqual([
      "dragos",
      "30thstreet",
      "12jlkfsk",
    ])
    const lever = candidatesFromYaml("lever", "- company: XTB\n  board: xtb\n  region: eu\n")
    expect(lever[0]).toMatchObject({ provider: "LEVER", providerBoardId: "eu:xtb" })
    expect(candidatesFromYaml("workday", yaml)).toEqual([])
  })

  it("keys a Workday board as tenant/wdN/site and skips the shared myworkdaysite host", () => {
    expect(workdayBoardId("motorolasolutions.wd5.myworkdayjobs.com/Careers")).toBe(
      "motorolasolutions/wd5/Careers"
    )
    expect(workdayBoardId("osv_chc.wd5.myworkdayjobs.com/careers-at-chc")).toBe(
      "osv_chc/wd5/careers-at-chc"
    )
    expect(workdayBoardId("wd1.myworkdaysite.com/snapchat/snap")).toBeNull()
    const boards = candidatesFromYaml(
      "workday",
      "- company: Motorola Solutions\n  board: motorolasolutions.wd5.myworkdayjobs.com/Careers\n"
    )
    expect(boards).toEqual([
      {
        provider: "WORKDAY",
        providerBoardId: "motorolasolutions/wd5/Careers",
        listedName: "Motorola Solutions",
      },
    ])
  })
})

describe("board identity", () => {
  it("treats a slug echoed as a name as no name at all", () => {
    expect(looksLikeJunkName("12jlkfsk", "12jlkfsk")).toBe(true)
    expect(looksLikeJunkName("1910", "1910")).toBe(true)
    expect(looksLikeJunkName("11 bit studios", "11bitstudios")).toBe(false)
    expect(looksLikeJunkName("Mistral", "mistral.ai")).toBe(false)
  })

  it("reads the company out of a board page title", () => {
    expect(nameFromTitle("Mistral Jobs")).toBe("Mistral")
    expect(nameFromTitle("Jobs at Acme")).toBe("Acme")
    expect(nameFromTitle("XTB")).toBe("XTB")
    expect(nameFromTitle("Jobs at ")).toBeNull()
  })

  it("ignores a department word published as the company and keeps the list's capitals", () => {
    expect(isGenericName("HR")).toBe(true)
    expect(isGenericName(" Careers ")).toBe(true)
    expect(isGenericName("HRS Group")).toBe(false)
    expect(preferredName("fortil", "Fortil")).toBe("Fortil")
    expect(preferredName("PixelPool", "Pixle Pool")).toBe("PixelPool")
    expect(preferredName("XTB", "xtb")).toBe("XTB")
  })

  it("names a Workday tenant by the list when the tenant or the hiring organisation agrees", () => {
    expect(workdayName("motorolasolutions/wd5/Careers", "Motorola Solutions", undefined)).toEqual({
      name: "Motorola Solutions",
    })
    expect(workdayName("sec/wd3/Samsung_Careers", "Samsung", "Samsung Electronics")).toEqual({
      name: "Samsung",
    })
    expect(workdayName("sec/wd3/Samsung_Careers", "Other Co", "Samsung Electronics")).toEqual({
      name: "Samsung Electronics",
    })
  })

  it("reads a board page on the host its offers link to", () => {
    const job = (originalUrl: string) => ({ originalUrl } as BoardList["jobs"][number])
    const eu = { proven: true, jobs: [job("https://jobs.eu.lever.co/xtb/f7f784f4")] }
    expect(boardPageUrl("LEVER", "xtb", eu)).toBe("https://jobs.eu.lever.co/xtb")
    expect(boardPageUrl("ASHBY", "acme", { proven: true, jobs: [] })).toBe(
      "https://jobs.ashbyhq.com/acme"
    )
    const own = { proven: true, jobs: [job("https://acme.com/careers/123")] }
    expect(boardPageUrl("ASHBY", "acme", own)).toBe("https://jobs.ashbyhq.com/acme")
  })

  it("guesses at most three slugs without corporate suffixes", () => {
    expect(slugCandidates("Acme Robotics Sp. z o.o.")).toEqual([
      "acmerobotics",
      "acme-robotics",
      "acme",
    ])
    expect(slugCandidates("Łódź Software GmbH")).toEqual(["lodzsoftware", "lodz-software", "lodz"])
  })
})

describe("catalog schedule", () => {
  const now = new Date("2026-11-03T10:00:00Z")
  it("reads a verified board daily and gives up on one that is not the company", () => {
    expect(nextCatalogCheck(now, "verified")?.toISOString()).toBe("2026-11-04T10:00:00.000Z")
    expect(nextCatalogCheck(now, "rejected", "no_it_jobs")?.toISOString()).toBe(
      "2026-11-10T10:00:00.000Z"
    )
    expect(nextCatalogCheck(now, "rejected", "identity")).toBeNull()
  })
})
