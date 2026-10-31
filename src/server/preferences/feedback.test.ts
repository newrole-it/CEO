import { describe, expect, it } from "vitest"
import {
  cleanNote,
  cleanTags,
  isVerdict,
  legacyMatchState,
  mergeFeedback,
  splitStoredTags,
  storedTags,
} from "./feedback"

describe("feedback validation", () => {
  it("accepts only known verdicts", () => {
    expect(isVerdict("LIKE")).toBe(true)
    expect(isVerdict("APPLIED")).toBe(true)
    expect(isVerdict("like")).toBe(false)
    expect(isVerdict(null)).toBe(false)
  })

  it("trims, dedupes, caps tag length and count", () => {
    const long = "x".repeat(80)
    expect(cleanTags(["  Kotlin ", "kotlin", "KOTLIN", "Zdalnie", "", 5, null, long])).toEqual([
      "Kotlin",
      "Zdalnie",
      "x".repeat(60),
    ])
    expect(cleanTags(Array.from({ length: 20 }, (_, i) => `tag ${i}`))).toHaveLength(12)
    expect(cleanTags(["Łódź", "lodz"])).toEqual(["Łódź"])
    expect(cleanTags("Kotlin")).toEqual([])
    expect(cleanTags(["-skill:kotlin"])).toEqual(["skill:kotlin"])
  })

  it("keeps notes short and turns blanks into null", () => {
    expect(cleanNote("  ")).toBeNull()
    expect(cleanNote(undefined)).toBeNull()
    expect(cleanNote(" fajny zespół ")).toBe("fajny zespół")
    expect(cleanNote("a".repeat(3000))).toHaveLength(2000)
  })

  it("mirrors the verdict onto the old JobMatch columns", () => {
    const now = new Date("2026-10-28T10:00:00Z")
    expect(legacyMatchState("LIKE", now)).toEqual({ interestedAt: now, dismissedAt: null })
    expect(legacyMatchState("APPLIED", now)).toEqual({ interestedAt: now, dismissedAt: null })
    expect(legacyMatchState("DISLIKE", now)).toEqual({ interestedAt: null, dismissedAt: now })
    expect(legacyMatchState(null, now)).toEqual({ interestedAt: null, dismissedAt: null })
  })

  it("keeps chips on a repeated verdict and resets them when the verdict changes", () => {
    const previous = {
      verdict: "LIKE",
      aspects: ["stack", "nope"],
      tags: ["Kotlin", "-work:remote"],
      note: "great",
    }
    expect(mergeFeedback(previous, { verdict: "LIKE" })).toEqual({
      aspects: ["stack"],
      tags: ["Kotlin", "-work:remote"],
      note: "great",
    })
    expect(mergeFeedback(previous, { verdict: "DISLIKE" })).toEqual({
      aspects: [],
      tags: ["-work:remote"],
      note: null,
    })
    expect(
      mergeFeedback(previous, {
        verdict: "LIKE",
        aspects: ["remote", "remote"],
        tags: [],
        note: "",
      })
    ).toEqual({ aspects: ["remote"], tags: ["-work:remote"], note: null })
    expect(mergeFeedback(null, { verdict: "APPLIED", tags: ["Kotlin"] })).toEqual({
      aspects: [],
      tags: ["Kotlin"],
      note: null,
    })
  })

  it("stores muted keys next to visible tags", () => {
    const stored = storedTags(["Kotlin"], ["skill:java"])
    expect(stored).toEqual(["Kotlin", "-skill:java"])
    expect(splitStoredTags(stored)).toEqual({ tags: ["Kotlin"], muted: ["skill:java"] })
    expect(splitStoredTags(null)).toEqual({ tags: [], muted: [] })
  })

  it("keeps the newest mutes when there are too many", () => {
    const keys = Array.from({ length: 45 }, (_, index) => `skill:s${index}`)
    const { muted } = splitStoredTags(storedTags([], keys))
    expect(muted).toHaveLength(40)
    expect(muted[39]).toBe("skill:s44")
    expect(muted).not.toContain("skill:s0")
  })
})
