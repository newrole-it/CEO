import { describe, expect, it } from "vitest"
import { hiringConfidence, type HiringFacts } from "./hiring-confidence"

const NOW = new Date("2026-11-12T12:00:00Z")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000)

const facts = (over: Partial<HiringFacts> = {}): HiringFacts => ({
  publishedAt: daysAgo(10),
  firstSeenAt: daysAgo(5),
  ownSite: true,
  viaIntermediary: false,
  possiblyClosed: false,
  sameTitleOpen: 0,
  applicationStatus: null,
  ...over,
})

const codes = (over: Partial<HiringFacts>) =>
  hiringConfidence(facts(over), NOW).signals.map((signal) => signal.code)

describe("hiring confidence", () => {
  it("rates a fresh posting on the company's own site high", () => {
    const result = hiringConfidence(facts(), NOW)
    expect(result).toEqual({
      score: 85,
      level: "high",
      signals: [
        { code: "age", points: 15, n: 10 },
        { code: "own-site", points: 10 },
      ],
    })
  })

  it("takes points off as the posting ages", () => {
    const score = (days: number) =>
      hiringConfidence(facts({ publishedAt: daysAgo(days) }), NOW).score
    expect([30, 31, 61, 91, 181].map(score)).toEqual([85, 70, 60, 50, 40])
  })

  it("rates an old posting repeated under the same title, through an intermediary, low", () => {
    const result = hiringConfidence(
      facts({
        publishedAt: daysAgo(200),
        ownSite: false,
        viaIntermediary: true,
        sameTitleOpen: 6,
      }),
      NOW
    )
    expect(result.score).toBe(5)
    expect(result.level).toBe("low")
    expect(result.signals.map((signal) => signal.code)).toEqual([
      "age",
      "intermediary",
      "evergreen",
    ])
  })

  it("does not guess the age of a posting without a date that was first seen lately", () => {
    const result = hiringConfidence(facts({ publishedAt: null }), NOW)
    expect(result.signals[0]).toEqual({ code: "age-unknown", points: 0 })
    expect(result.score).toBe(70)
  })

  it("counts a posting without a date as at least as old as its first sighting", () => {
    const result = hiringConfidence(facts({ publishedAt: null, firstSeenAt: daysAgo(100) }), NOW)
    expect(result.signals[0]).toEqual({ code: "seen", points: -20, n: 100 })
  })

  it("ignores a publication date in the future", () => {
    expect(codes({ publishedAt: daysAgo(-3) })).toEqual(["age-unknown", "own-site"])
  })

  it("counts one other posting with the same title as nothing, two as a weak sign", () => {
    expect(codes({ sameTitleOpen: 1 })).not.toContain("evergreen")
    const result = hiringConfidence(facts({ sameTitleOpen: 2 }), NOW)
    expect(result.signals.at(-1)).toEqual({ code: "evergreen", points: -5, n: 2 })
  })

  it("lets talks with the company outweigh an old posting", () => {
    const result = hiringConfidence(
      facts({ publishedAt: daysAgo(200), applicationStatus: "INTERVIEW" }),
      NOW
    )
    expect(result.signals.at(-1)).toEqual({ code: "in-talks", points: 40 })
    expect(result.level).toBe("high")
  })

  it("takes points off when the application got no reply or the posting may be closed", () => {
    expect(codes({ applicationStatus: "GHOSTED" })).toContain("no-reply")
    expect(codes({ possiblyClosed: true })).toContain("maybe-closed")
    expect(codes({ applicationStatus: "APPLIED" })).toEqual(["age", "own-site"])
  })

  it("keeps the score between 0 and 100", () => {
    const low = hiringConfidence(
      facts({
        publishedAt: daysAgo(400),
        ownSite: false,
        viaIntermediary: true,
        sameTitleOpen: 9,
        possiblyClosed: true,
        applicationStatus: "GHOSTED",
      }),
      NOW
    )
    expect(low.score).toBe(0)
    const high = hiringConfidence(facts({ applicationStatus: "OFFER" }), NOW)
    expect(high.score).toBe(100)
  })
})
