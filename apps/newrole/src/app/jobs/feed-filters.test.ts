import { describe, expect, it } from "vitest"
import type { KeepOffer } from "src/server/jobs/browse"
import { keepFor } from "./feed-data"
import { clearedFilters, filtersQuery, hasActiveFilters, parseFilters } from "./feed-filters"

describe("clearing the feed filters", () => {
  it("leaves every country, not the person's own, when there is one", () => {
    const filters = parseFilters({ mode: "remote", fresh: "7", company: "c1", sort: "new" })
    const cleared = clearedFilters(filters, "PL")
    expect(cleared).toMatchObject({ country: "any", mode: "any", fresh: false, company: "" })
    expect(filtersQuery(cleared, "foryou")).toBe("/jobs?country=any&sort=new")
  })

  it("keeps remoteHere in the URL and turns it off with the rest", () => {
    const filters = parseFilters({ country: "PL", remotehere: "1" })
    expect(filters.remoteHere).toBe(true)
    expect(filtersQuery(filters, "foryou")).toBe("/jobs?country=PL&remotehere=1")
    expect(clearedFilters(filters, "PL").remoteHere).toBe(false)
    expect(parseFilters({ country: "PL" }).remoteHere).toBe(false)
  })

  it("keeps the URL bare when there is no own country to undo", () => {
    expect(filtersQuery(clearedFilters(parseFilters({ city: "Kraków" }), null), "all")).toBe(
      "/jobs?tab=all"
    )
  })

  it("counts the default country as a filter in force", () => {
    const none = parseFilters({})
    expect(hasActiveFilters(none, "PL")).toBe(true)
    expect(hasActiveFilters(none, null)).toBe(false)
    expect(hasActiveFilters(parseFilters({ company: "c1" }), null)).toBe(true)
  })
})

describe("keepFor", () => {
  const offer = (partial: Partial<KeepOffer>) =>
    ({
      title: "Backend Engineer",
      seniorityLevel: null,
      sourceKind: "ats",
      payListed: false,
      ...partial,
    } as KeepOffer)

  it("adds no test when no such filter is on", () => {
    expect(keepFor(parseFilters({ mode: "remote", company: "c1" }))).toBeUndefined()
  })

  it("keeps the picked seniority, read from the title when none is stored", () => {
    const keep = keepFor(parseFilters({ seniority: "senior" }))!
    expect(keep(offer({ title: "Senior Backend Engineer" }))).toBe(true)
    expect(keep(offer({ title: "Junior Backend Engineer" }))).toBe(false)
    expect(keep(offer({ title: "Backend Engineer", seniorityLevel: "senior" }))).toBe(true)
  })

  it("keeps company sites and offers with a salary when asked", () => {
    const keep = keepFor(parseFilters({ source: "company", payonly: "1" }))!
    expect(keep(offer({ sourceKind: "company-site", payListed: true }))).toBe(true)
    expect(keep(offer({ sourceKind: "link-only", payListed: true }))).toBe(false)
    expect(keep(offer({ sourceKind: "ats", payListed: false }))).toBe(false)
  })
})
