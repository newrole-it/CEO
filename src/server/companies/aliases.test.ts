import { describe, expect, it } from "vitest"
import { COMPANY_ALIASES } from "config/company-aliases"
import { companyKey } from "src/server/gmail/allowlist"
import { planCompanyAliases } from "./aliases"
import { companyNameKey } from "./names"

function keysOf(rows: ReturnType<typeof planCompanyAliases>, companyId: string) {
  return rows
    .filter((row) => row.companyId === companyId)
    .map((row) => row.normalizedAlias)
    .sort()
}

describe("planCompanyAliases", () => {
  it("writes the key of each company's name, and nothing from its brackets", () => {
    const rows = planCompanyAliases({
      companies: [
        { id: "a", name: "Techland S.A." },
        { id: "b", name: "Mangopay (incl. Nethone)" },
      ],
      boards: [],
      curated: [],
    })
    expect(rows).toEqual([
      { companyId: "a", alias: "Techland S.A.", normalizedAlias: "techland", confidence: 1 },
      { companyId: "b", alias: "Mangopay", normalizedAlias: "mangopay", confidence: 1 },
    ])
  })

  it("gives two index rows of one company the same key, without touching them", () => {
    const rows = planCompanyAliases({
      companies: [
        { id: "a", name: "Wolt" },
        { id: "b", name: "Wolt - English" },
      ],
      boards: [],
      curated: [],
    })
    expect(keysOf(rows, "a")).toEqual(["wolt"])
    expect(keysOf(rows, "b")).toEqual(["wolt"])
  })

  it("adds curated names to every row of the company, and ignores unknown companies", () => {
    const rows = planCompanyAliases({
      companies: [
        { id: "a", name: "Text" },
        { id: "b", name: "Text S.A." },
      ],
      boards: [],
      curated: [
        { company: "Text", aliases: ["LiveChat Software"] },
        { company: "Nobody", aliases: ["Nobody Else"] },
      ],
    })
    expect(keysOf(rows, "a")).toEqual(["livechatsoftware", "text"])
    expect(keysOf(rows, "b")).toEqual(["livechatsoftware", "text"])
    expect(rows.map((row) => row.normalizedAlias)).not.toContain("nobodyelse")
  })

  it("takes ATS board slugs, but no hosts, tenant paths or prefixes", () => {
    const rows = planCompanyAliases({
      companies: [{ id: "a", name: "Miro" }],
      boards: [
        { companyId: "a", boardId: "realtimeboardglobal" },
        { companyId: "a", boardId: "booksy-1" },
        { companyId: "a", boardId: "careers.allegro.eu" },
        { companyId: "a", boardId: "visa/wd5/Visa" },
        { companyId: "a", boardId: "eu:olx" },
        { companyId: "a", boardId: "12345" },
        { companyId: "a", boardId: null },
      ],
      curated: [],
    })
    expect(keysOf(rows, "a")).toEqual(["booksy1", "miro", "realtimeboardglobal"])
  })

  it("keeps the most trusted row when two sources give one key", () => {
    const rows = planCompanyAliases({
      companies: [{ id: "a", name: "Acme" }],
      boards: [{ companyId: "a", boardId: "acme" }],
      curated: [],
    })
    expect(rows).toEqual([
      { companyId: "a", alias: "Acme", normalizedAlias: "acme", confidence: 1 },
    ])
  })

  it("has nothing to say about a name with no key", () => {
    expect(
      planCompanyAliases({ companies: [{ id: "a", name: "Sp. z o.o." }], boards: [], curated: [] })
    ).toEqual([])
  })
})

describe("the curated list", () => {
  it.each(COMPANY_ALIASES.map((entry) => [entry.company, entry] as const))(
    "%s says what its source says, and where it was read",
    (_company, entry) => {
      expect(entry.source).toMatch(/^https:\/\/[^/]+\.[^/]+/)
      expect(entry.fact.length).toBeGreaterThan(20)
      expect(entry.checked).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(entry.aliases.length).toBeGreaterThan(0)
    }
  )

  it("ties no two companies together, and says more than the spelling does", () => {
    const owner = new Map<string, string>()
    for (const entry of COMPANY_ALIASES) {
      const company = companyNameKey(entry.company)
      expect(company, entry.company).toBeTruthy()
      for (const alias of entry.aliases) {
        const key = companyKey(alias)
        expect(key, alias).not.toBe(company)
        expect(owner.get(key) ?? company, alias).toBe(company)
        owner.set(key, company)
      }
    }
  })
})
