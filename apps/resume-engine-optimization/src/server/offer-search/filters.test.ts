import { describe, expect, test } from "vitest"
import type { CandidateProfile } from "@prisma/client"
import { filtersDiffer } from "src/shared/offer-search"
import {
  filtersFromProfile,
  personFromFilters,
  profileDiff,
  profilePatch,
  SearchFilters,
} from "./filters"

function profile(partial: Partial<CandidateProfile> = {}): CandidateProfile {
  return {
    id: "p1",
    userId: 1,
    headline: null,
    currentTitle: null,
    pastTitles: [],
    seniority: null,
    yearsExperience: null,
    skills: [],
    industries: [],
    locations: [],
    languages: [],
    salaryFloor: null,
    salaryTarget: null,
    salaryCurrency: null,
    salaryPeriod: null,
    salaryContract: null,
    industryMode: "prefer",
    contracts: [],
    remotePreference: null,
    homeCity: null,
    relocation: null,
    linkedinDocument: null,
    linkedinImportedAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...partial,
  }
}

describe("filters from the profile", () => {
  test("a full profile becomes filters", () => {
    const f = filtersFromProfile(
      profile({
        currentTitle: "Senior Product Manager",
        pastTitles: ["Product Manager", "PO", "BA", "QA"],
        seniority: "senior",
        skills: ["SQL", "Jira", "A/B", "Figma", "Python", "Amplitude", "OKR", "Scrum", "Kanban"],
        homeCity: "Warszawa",
        locations: ["Kraków"],
        relocation: false,
        remotePreference: "remote",
        salaryFloor: 25000,
        salaryCurrency: "PLN",
        salaryPeriod: "month",
        salaryContract: "b2b",
      })
    )
    expect(f.roles).toEqual(["Senior Product Manager", "Product Manager", "PO"])
    expect(f.skills).toHaveLength(8)
    expect(f.places).toEqual(["Warszawa", "Kraków"])
    expect(f.workMode).toBe("remote")
    expect(f.minPay).toEqual({ amount: 25000, currency: "PLN", period: "month", contract: "b2b" })
    expect(f.freshnessDays).toBe(30)
    expect(SearchFilters.safeParse(f).success).toBe(true)
  })

  test("no profile gives empty filters that still parse", () => {
    const f = filtersFromProfile(null)
    expect(f.roles).toEqual([])
    expect(f.level).toBeNull()
    expect(f.minPay.amount).toBeNull()
    expect(f.workMode).toBe("any")
    expect(SearchFilters.safeParse(f).success).toBe(true)
  })

  test("roles are deduplicated ignoring case", () => {
    expect(
      filtersFromProfile(profile({ currentTitle: "PM", pastTitles: ["pm", "PM ", "CTO"] })).roles
    ).toEqual(["PM", "CTO"])
  })

  test("values outside the enums fall back", () => {
    const f = filtersFromProfile(profile({ seniority: "wizard", remotePreference: "moon" }))
    expect(f.level).toBeNull()
    expect(f.workMode).toBe("any")
  })

  test("a profile value outside the profile's own rules is left out, so the filters still parse", () => {
    const f = filtersFromProfile(
      profile({
        salaryCurrency: "zł",
        salaryFloor: -5,
        homeCity: "x".repeat(81),
        locations: ["Kraków", "y".repeat(81)],
        skills: ["SQL", "z".repeat(81)],
      })
    )
    expect(f.minPay.currency).toBeNull()
    expect(f.minPay.amount).toBeNull()
    expect(f.places).toEqual(["Kraków"])
    expect(f.skills).toEqual(["SQL"])
    expect(SearchFilters.safeParse(f).success).toBe(true)
    expect(filtersFromProfile(profile({ salaryFloor: 10_000_001 })).minPay.amount).toBeNull()
    expect(filtersFromProfile(profile({ salaryCurrency: " CHF " })).minPay.currency).toBe("CHF")
  })

  test("places are the home city then the locations, deduplicated", () => {
    expect(
      filtersFromProfile(profile({ homeCity: "Gdańsk", locations: ["gdańsk", "Sopot"] })).places
    ).toEqual(["Gdańsk", "Sopot"])
  })
})

describe("personFromFilters", () => {
  test("maps the person's side", () => {
    const p = personFromFilters(
      {
        ...filtersFromProfile(null),
        level: "mid",
        workMode: "hybrid",
        places: ["Gdańsk", "Sopot"],
        minPay: { amount: 18000, currency: "PLN", period: "month", contract: "uop" },
      },
      22000
    )
    expect(p).toEqual({
      seniority: "mid",
      salaryFloor: 18000,
      salaryTarget: 22000,
      salaryCurrency: "PLN",
      salaryPeriod: "month",
      salaryContract: "uop",
      remotePreference: "hybrid",
      homeCity: "Gdańsk",
      locations: ["Sopot"],
      relocation: false,
    })
  })
})

describe("profileDiff and filtersDiffer", () => {
  test("profileDiff is false for the profile's own filters and true after a change", () => {
    const p = profile({ seniority: "senior", remotePreference: "remote", salaryFloor: 25000 })
    const f = filtersFromProfile(p)
    expect(profileDiff(f, p)).toBe(false)
    expect(profileDiff({ ...f, workMode: "any" }, p)).toBe(true)
  })

  test("filtersDiffer compares level, pay, work mode, places and relocation", () => {
    const f = filtersFromProfile(profile({ homeCity: "Łódź", locations: ["Poznań"] }))
    expect(filtersDiffer(f, { ...f, places: [" Łódź ", "Poznań"] })).toBe(false)
    expect(filtersDiffer(f, { ...f, places: ["Poznań", "Łódź"] })).toBe(true)
    expect(filtersDiffer(f, { ...f, level: "lead" })).toBe(true)
    expect(filtersDiffer(f, { ...f, relocation: true })).toBe(true)
    expect(filtersDiffer(f, { ...f, minPay: { ...f.minPay, contract: "uop" } })).toBe(true)
    expect(filtersDiffer(f, { ...f, minPay: { ...f.minPay, period: "year" } })).toBe(true)
    expect(filtersDiffer(f, { ...f, skills: ["SQL"] })).toBe(false)
  })
})

describe("SearchFilters is bounded like the profile", () => {
  const base = filtersFromProfile(null)
  // loose on purpose: what a request could send, not what the type allows
  const pay = (minPay: Record<string, unknown>) => ({
    ...base,
    minPay: { ...base.minPay, ...minPay },
  })

  test("pay: the profile's currencies only, an amount from 0 to 10 000 000", () => {
    expect(SearchFilters.safeParse(pay({ currency: "zł" })).success).toBe(false)
    expect(SearchFilters.safeParse(pay({ currency: "pln" })).success).toBe(false)
    expect(SearchFilters.safeParse(pay({ amount: -1 })).success).toBe(false)
    expect(SearchFilters.safeParse(pay({ amount: 10_000_001 })).success).toBe(false)
    for (const currency of ["PLN", "EUR", "USD", "GBP", "CHF", null]) {
      expect(SearchFilters.safeParse(pay({ currency })).success).toBe(true)
    }
    expect(SearchFilters.safeParse(pay({ amount: 0 })).success).toBe(true)
    expect(SearchFilters.safeParse(pay({ amount: 10_000_000 })).success).toBe(true)
  })

  test("every list item is at most 80 characters", () => {
    expect(SearchFilters.safeParse({ ...base, places: ["x".repeat(81)] }).success).toBe(false)
    expect(SearchFilters.safeParse({ ...base, places: ["x".repeat(80)] }).success).toBe(true)
    for (const list of ["skills", "excluded", "contracts", "industries", "languages"] as const) {
      expect(SearchFilters.safeParse({ ...base, [list]: ["x".repeat(81)] }).success).toBe(false)
    }
  })

  test("profilePatch checks its fields against the profile's own schema", () => {
    // filters that skipped SearchFilters (a currency the profile does not know)
    const loose = {
      ...base,
      minPay: { ...base.minPay, currency: "zł" },
    } as unknown as SearchFilters
    expect(() => profilePatch(loose)).toThrow()
  })
})

test("profilePatch writes the profile fields", () => {
  const f = {
    ...filtersFromProfile(null),
    level: "lead" as const,
    places: ["Łódź", "Poznań"],
    workMode: "onsite" as const,
    relocation: true,
    minPay: { amount: 100, currency: "EUR" as const, period: "year" as const, contract: null },
  }
  expect(profilePatch(f)).toEqual({
    seniority: "lead",
    salaryFloor: 100,
    salaryCurrency: "EUR",
    salaryPeriod: "year",
    salaryContract: null,
    remotePreference: "onsite",
    homeCity: "Łódź",
    locations: ["Poznań"],
    relocation: true,
  })
})
