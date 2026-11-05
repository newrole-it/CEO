import { describe, expect, it } from "vitest"
import {
  extractSkills,
  profileOffer,
  roleLabel,
  salaryBand,
  tagToFact,
  titleSimilarity,
} from "./facts"
import { buildSuggestions, profileMatches, type PromptProfile } from "./prompt"
import type { OfferForScoring } from "./types"

const kotlin: OfferForScoring = {
  id: "job-kotlin",
  title: "Senior Kotlin Developer (m/f/d) - Payments",
  description:
    "Fintech scale-up. Requirements: Kotlin, Spring Boot, PostgreSQL, Kafka, AWS. Nice to have: Docker. Umowa B2B.",
  company: "Allegro Pay sp. z o.o.",
  locationText: "Remote, Poland",
  countryCode: "PL",
  workplaceType: "REMOTE",
  salaryMin: 25000,
  salaryMax: 30000,
  salaryCurrency: "PLN",
  seniorityLevel: null,
  employmentType: "B2B",
}

const emptyProfile: PromptProfile = {
  currentTitle: null,
  pastTitles: [],
  skills: [],
  industries: [],
  seniority: null,
  remotePreference: null,
  homeCity: null,
  locations: [],
  salaryFloor: null,
  salaryTarget: null,
  salaryCurrency: null,
  salaryPeriod: null,
  salaryContract: null,
  contracts: [],
}

describe("offer facts", () => {
  it("finds skills in the title and description without false friends", () => {
    const found = extractSkills(
      "Senior Kotlin Developer",
      "Spring Boot, PostgreSQL and Kafka on AWS"
    )
    expect(found[0]).toBe("kotlin")
    expect([...found].sort()).toEqual(["aws", "kafka", "kotlin", "postgresql", "spring"])
    expect(extractSkills("Go-to-market Manager", "")).toEqual([])
    expect(extractSkills("Backend Engineer (Go)", "")).toEqual(["golang"])
    expect(extractSkills("JavaScript Developer", "")).toEqual(["javascript"])
    expect(extractSkills("Analyst", "We value trust and scalable postgresql")).toEqual([
      "postgresql",
    ])
  })

  it("cleans the role label", () => {
    expect(roleLabel("Senior Kotlin Developer (m/f/d) - Payments")).toBe("Kotlin Developer")
    expect(roleLabel("(Senior) Fullstack Engineer (Go)")).toBe("Fullstack Engineer")
    expect(roleLabel("Senior/Mid Node.js Backend Developer")).toBe("Node.js Backend Developer")
    expect(roleLabel("Staff Machine Learning Engineer, Ads")).toBe("Machine Learning Engineer")
  })

  it("rounds a salary into a readable band", () => {
    expect(salaryBand(25000, 30000)).toEqual({ pl: "25–30k zł / mies.", en: "25–30k PLN / month" })
  })

  it("weights generic title words down", () => {
    expect(titleSimilarity(["data", "engineer"], ["java", "engineer"])).toBeLessThan(0.5)
    expect(titleSimilarity(["kotlin", "developer"], ["kotlin", "developer"])).toBe(1)
  })

  it("lists every aspect of an offer with PL and EN labels", () => {
    const offer = profileOffer(kotlin)
    const byAspect = (aspect: string) =>
      offer.facts.filter((fact) => fact.aspect === aspect).map((fact) => fact.label.pl)
    expect(byAspect("role")).toEqual(["Kotlin Developer"])
    expect(byAspect("stack")).toEqual(
      expect.arrayContaining(["Kotlin", "Spring", "PostgreSQL", "Kafka", "AWS", "Docker"])
    )
    expect(byAspect("salary")).toEqual(["25–30k zł / mies."])
    expect(byAspect("remote")).toEqual(["100% zdalnie"])
    expect(byAspect("company")).toEqual(["Allegro Pay sp. z o.o."])
    // The title names payments before the description says fintech.
    expect(byAspect("industry")).toEqual(["płatności"])
    expect(byAspect("seniority")).toEqual(["Senior"])
    expect(byAspect("contract")).toEqual(["B2B"])
    expect(byAspect("scope")).toEqual(["Startup / scale-up"])
    expect(offer.workMode).toBe("remote")
  })

  it("maps picked tags back to facts, in either language or as free text", () => {
    const { facts } = profileOffer(kotlin)
    expect(tagToFact("kotlin", facts)?.key).toBe("skill:kotlin")
    expect(tagToFact("Fully remote", facts)?.key).toBe("work:remote")
    expect(tagToFact("100% zdalnie", facts)?.key).toBe("work:remote")
    expect(tagToFact("Fajny zespół", facts)?.key).toBe("text:fajny zespol")
    expect(tagToFact("  ", facts)).toBeNull()
  })
})

describe("feedback prompt", () => {
  it("returns one suggestion per aspect with the offer's tags", () => {
    const suggestions = buildSuggestions(profileOffer(kotlin), "pl", new Set())
    expect(suggestions.map((item) => item.aspect)).toEqual([
      "role",
      "stack",
      "seniority",
      "salary",
      "remote",
      "location",
      "company",
      "industry",
      "scope",
      "contract",
    ])
    expect(suggestions.find((item) => item.aspect === "remote")?.tags).toEqual(["100% zdalnie"])
    expect(suggestions.find((item) => item.aspect === "stack")?.tags.length).toBeLessThanOrEqual(6)
    expect(suggestions.every((item) => !item.preselected)).toBe(true)
    const english = buildSuggestions(profileOffer(kotlin), "en", new Set())
    expect(english.find((item) => item.aspect === "salary")?.tags).toEqual(["25–30k PLN / month"])
  })

  it("preselects aspects that match the profile", () => {
    const matches = profileMatches(profileOffer(kotlin), {
      ...emptyProfile,
      currentTitle: "Kotlin Developer",
      skills: ["Kotlin", "Go"],
      industries: ["fintech"],
      seniority: "senior",
      remotePreference: "remote",
      salaryFloor: 20000,
      salaryCurrency: "PLN",
      salaryPeriod: "month",
      salaryContract: "b2b",
    })
    expect([...matches].sort()).toEqual(
      ["contract", "industry", "remote", "role", "salary", "seniority", "stack"].sort()
    )
    expect(profileMatches(profileOffer(kotlin), null).size).toBe(0)
    expect(
      profileMatches(profileOffer(kotlin), { ...emptyProfile, salaryFloor: 40000 }).has("salary")
    ).toBe(false)
  })
})
