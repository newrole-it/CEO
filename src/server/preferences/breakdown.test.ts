import { describe, expect, it } from "vitest"
import { PART_MAX, feedBreakdown, freshnessValue, sourceOf } from "./breakdown"
import { profileOffer } from "./facts"

describe("offer source", () => {
  it("tells ATS, company site, MCP and link-only apart", () => {
    expect(
      sourceOf({ sourceType: "GREENHOUSE", sourceBoardId: "acme", hasDescription: true })
    ).toEqual({
      sourceKind: "ats",
      provider: "Greenhouse",
    })
    expect(
      sourceOf({ sourceType: "CAREER_SITE", sourceBoardId: null, hasDescription: true })
    ).toEqual({
      sourceKind: "company-site",
      provider: null,
    })
    expect(
      sourceOf({
        sourceType: "WEB_SEARCH",
        sourceBoardId: "mcp:acme.com:acme",
        hasDescription: true,
      }).sourceKind
    ).toBe("mcp")
    expect(
      sourceOf({ sourceType: "WEB_SEARCH", sourceBoardId: "page:x", hasDescription: false })
        .sourceKind
    ).toBe("link-only")
  })
})

describe("feed breakdown", () => {
  const now = new Date("2026-10-28T12:00:00Z")
  const offer = profileOffer({
    title: "Senior Kotlin Developer",
    description: "",
    company: "Acme",
    locationText: "Warszawa",
    countryCode: "PL",
    workplaceType: "REMOTE",
    salaryMin: 25000,
    salaryMax: 30000,
    salaryCurrency: "PLN",
    seniorityLevel: "senior",
  })

  it("uses the scoring maxima and never exceeds 100", () => {
    const { parts, base } = feedBreakdown({
      offer,
      profile: {
        currentTitle: "Kotlin Developer",
        pastTitles: [],
        seniority: "senior",
        remotePreference: "remote",
        homeCity: "Warszawa",
        locations: [],
        salaryFloor: 20000,
        salaryTarget: null,
        salaryCurrency: "PLN",
        salaryPeriod: "month",
        salaryContract: "b2b",
      },
      firstSeenAt: now,
      publishedAt: null,
      sourceKind: "ats",
      provider: "Greenhouse",
      now,
    })
    expect(parts.map((part) => part.id)).toEqual([
      "title",
      "seniority",
      "location",
      "salary",
      "freshness",
      "source",
    ])
    expect(parts.every((part) => part.max === PART_MAX[part.id] && part.points <= part.max)).toBe(
      true
    )
    expect(base).toBe(100)
  })

  it("is neutral without a profile", () => {
    const { base } = feedBreakdown({
      offer,
      profile: null,
      firstSeenAt: new Date("2026-08-01T00:00:00Z"),
      publishedAt: null,
      sourceKind: "link-only",
      provider: null,
      now,
    })
    expect(base).toBeGreaterThan(30)
    expect(base).toBeLessThan(80)
  })

  it("decays freshness in steps", () => {
    expect(freshnessValue(0)).toBe(1)
    expect(freshnessValue(10)).toBe(0.7)
    expect(freshnessValue(90)).toBe(0)
  })
})
