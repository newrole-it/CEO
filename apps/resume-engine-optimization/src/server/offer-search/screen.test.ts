import { describe, expect, test } from "vitest"
import { filtersFromProfile, personFromFilters } from "./filters"
import { rankResults, screenOffer } from "./screen"

const now = new Date("2026-11-27T12:00:00Z")
const day = 24 * 60 * 60 * 1000

const base = {
  title: "Data Engineer",
  text: "",
  workplace: null as string | null,
  location: null as string | null,
  salaryMin: null as number | null,
  salaryMax: null as number | null,
  salaryCurrency: null as string | null,
  hiring: null,
  publishedAt: null as Date | null,
}

const filters = {
  ...filtersFromProfile(null),
  workMode: "remote" as const,
  level: "senior" as const,
  minPay: { amount: 15000, currency: "PLN" as const, period: "month" as const, contract: null },
}
const person = personFromFilters(filters, null)

describe("screenOffer", () => {
  test("pay below the floor drops", () => {
    const offer = {
      ...base,
      title: "Senior Data Engineer",
      workplace: "REMOTE",
      salaryMin: 8000,
      salaryMax: 9000,
      salaryCurrency: "PLN/month",
    }
    expect(screenOffer(offer, filters, person, now)).toBe("pay-below")
  })

  test("a work mode that is the opposite drops", () => {
    const offer = { ...base, title: "Senior Data Engineer", workplace: "ONSITE" }
    expect(screenOffer(offer, filters, person, now)).toBe("work-mode")
  })

  test("a level two steps away drops", () => {
    const offer = { ...base, title: "Junior Data Engineer", workplace: "REMOTE" }
    expect(screenOffer(offer, filters, person, now)).toBe("level")
  })

  test("an excluded word in the title drops, ignoring case and diacritics", () => {
    const f = { ...filters, level: null, excluded: ["Ślusarz"] }
    const offer = { ...base, title: "Senior ŚLUSARZ data", workplace: "REMOTE" }
    expect(screenOffer(offer, f, personFromFilters(f, null), now)).toBe("excluded-word")
    const plain = { ...base, title: "slusarz", workplace: "REMOTE" }
    expect(screenOffer(plain, f, personFromFilters(f, null), now)).toBe("excluded-word")
  })

  test("an excluded word matches whole words only", () => {
    const f = { ...filters, level: null, excluded: ["Java"] }
    const p = personFromFilters(f, null)
    const js = { ...base, title: "JavaScript Developer", workplace: "REMOTE" }
    expect(screenOffer(js, f, p, now)).toBeNull()
    const java = { ...base, title: "Senior Java Developer", workplace: "REMOTE" }
    expect(screenOffer(java, f, p, now)).toBe("excluded-word")
  })

  test("an excluded phrase matches as a contiguous phrase", () => {
    const f = { ...filters, level: null, excluded: ["team lead"] }
    const offer = { ...base, title: "Team Lead, Payments", workplace: "REMOTE" }
    expect(screenOffer(offer, f, personFromFilters(f, null), now)).toBe("excluded-word")
  })

  test("an office outside the accepted places drops as place, unless relocation is on", () => {
    const f = { ...filtersFromProfile(null), places: ["Warszawa"], relocation: false }
    const offer = { ...base, workplace: "ONSITE", location: "Gdańsk" }
    expect(screenOffer(offer, f, personFromFilters(f, null), now)).toBe("place")
    const r = { ...f, relocation: true }
    expect(screenOffer(offer, r, personFromFilters(r, null), now)).toBeNull()
  })

  test("a management title against an individual-contributor level does not drop", () => {
    const offer = { ...base, title: "Engineering Manager", workplace: "REMOTE" }
    expect(screenOffer(offer, filters, person, now)).toBeNull()
  })

  test("a target without a floor does not drop on pay", () => {
    const f = { ...filters, minPay: { ...filters.minPay, amount: null } }
    const offer = {
      ...base,
      title: "Senior Data Engineer",
      workplace: "REMOTE",
      salaryMin: 3000,
      salaryMax: 3500,
      salaryCurrency: "PLN/month",
    }
    expect(screenOffer(offer, f, personFromFilters(f, 20000), now)).toBeNull()
  })

  test("an offer pay without a period does not drop", () => {
    const offer = {
      ...base,
      title: "Senior Data Engineer",
      workplace: "REMOTE",
      salaryMin: 3000,
      salaryMax: 3500,
      salaryCurrency: "PLN",
    }
    expect(screenOffer(offer, filters, person, now)).toBeNull()
  })

  test("an offer older than the freshness drops", () => {
    const f = { ...filters, level: null, freshnessDays: 7 as const }
    const old = { ...base, workplace: "REMOTE", publishedAt: new Date(now.getTime() - 8 * day) }
    expect(screenOffer(old, f, personFromFilters(f, null), now)).toBe("too-old")
    const fresh = { ...old, publishedAt: new Date(now.getTime() - 6 * day) }
    expect(screenOffer(fresh, f, personFromFilters(f, null), now)).toBeNull()
  })

  test("nothing known drops nothing", () => {
    const offer = { ...base, workplace: "UNKNOWN" }
    expect(screenOffer(offer, filters, person, now)).toBeNull()
  })

  test("an empty filter drops nothing", () => {
    const f = { ...filtersFromProfile(null), workMode: "any" as const }
    const offer = {
      ...base,
      title: "Junior Data Engineer",
      workplace: "REMOTE",
      salaryMin: 5000,
      salaryMax: 5000,
      salaryCurrency: "PLN/month",
    }
    expect(screenOffer(offer, f, personFromFilters(f, null), now)).toBeNull()
  })
})

describe("rankResults", () => {
  test("orders by decision, then score descending, null last", () => {
    const rows = [
      { decision: "skip", score: 90 },
      { decision: "apply", score: 61 },
      { decision: "consider", score: 59 },
      { decision: "apply", score: 80 },
      { decision: "unknown", score: null },
      { decision: null, score: null },
    ] as const
    expect(rankResults([...rows]).map((r) => [r.decision, r.score])).toEqual([
      ["apply", 80],
      ["apply", 61],
      ["consider", 59],
      ["skip", 90],
      ["unknown", null],
      [null, null],
    ])
  })

  test("keeps the order of equal rows", () => {
    const rows = [
      { id: 1, decision: "apply" as const, score: null },
      { id: 2, decision: "apply" as const, score: 70 },
      { id: 3, decision: "apply" as const, score: null },
    ]
    expect(rankResults(rows).map((r) => r.id)).toEqual([2, 1, 3])
  })
})
