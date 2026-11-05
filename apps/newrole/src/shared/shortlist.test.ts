import { describe, expect, it } from "vitest"
import { profileReady, takeShortlist } from "./shortlist"

describe("profile shortlist", () => {
  it("treats an empty profile row as not ready", () => {
    expect(profileReady(null)).toBe(false)
    expect(profileReady({ headline: "  ", currentTitle: null, linkedinImportedAt: null })).toBe(
      false
    )
  })

  it("is ready after a LinkedIn import or a saved title", () => {
    expect(
      profileReady({ linkedinImportedAt: new Date(), headline: null, currentTitle: null })
    ).toBe(true)
    expect(profileReady({ headline: null, currentTitle: "Data Engineer" })).toBe(true)
  })

  it("keeps the top matches until the full list is requested", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(takeShortlist(rows, true, false)).toEqual({
      rows: [1, 2, 3, 4, 5, 6, 7, 8],
      shortlisted: true,
    })
    expect(takeShortlist(rows, true, true).shortlisted).toBe(false)
    expect(takeShortlist(rows, false, false).rows).toHaveLength(10)
    expect(takeShortlist([1, 2], true, false).shortlisted).toBe(false)
  })
})
