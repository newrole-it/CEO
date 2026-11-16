import { describe, expect, it } from "vitest"
import {
  COLD_AFTER_DAYS,
  computeFollowups,
  followupFor,
  type FollowupApplication,
} from "./followups"
import {
  computePatterns,
  isDecided,
  matchBand,
  PATTERN_RULES,
  postingAgeBand,
  type PatternApplication,
} from "./patterns"

const NOW = new Date("2026-11-16T12:00:00")
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()

let counter = 0
function app(over: Partial<PatternApplication> = {}): PatternApplication {
  counter += 1
  return {
    id: `a${counter}`,
    status: "APPLIED",
    closedAtStage: null,
    appliedAt: daysAgo(40),
    statusChangedAt: daysAgo(40),
    source: "extension",
    events: [],
    matchScore: null,
    cv: null,
    letter: null,
    workplace: null,
    intermediary: null,
    postingAgeDays: null,
    evaluation: null,
    ...over,
  }
}

const many = (n: number, over: Partial<PatternApplication>) =>
  Array.from({ length: n }, () => app(over))

describe("what counts as an outcome", () => {
  it("a reply, a close or long silence does; recent silence and an early withdrawal do not", () => {
    expect(isDecided(app({ status: "SCREENING" }), NOW)).toBe(true)
    expect(isDecided(app({ status: "REJECTED" }), NOW)).toBe(true)
    expect(isDecided(app({ status: "GHOSTED" }), NOW)).toBe(true)
    expect(isDecided(app({ appliedAt: daysAgo(COLD_AFTER_DAYS) }), NOW)).toBe(true)
    expect(isDecided(app({ appliedAt: daysAgo(COLD_AFTER_DAYS - 1) }), NOW)).toBe(false)
    expect(isDecided(app({ status: "WITHDRAWN", closedAtStage: "APPLIED" }), NOW)).toBe(false)
  })

  it("bands the match score and the posting's age", () => {
    expect([matchBand(80), matchBand(60), matchBand(59), matchBand(null)]).toEqual([
      "75+",
      "60-74",
      "under-60",
      null,
    ])
    expect([postingAgeBand(0), postingAgeBand(8), postingAgeBand(31), postingAgeBand(-1)]).toEqual([
      "0-7",
      "8-30",
      "31+",
      null,
    ])
  })
})

describe("patterns", () => {
  it("say how many more outcomes they need before anything is shown", () => {
    const patterns = computePatterns(many(3, { status: "REJECTED" }), { now: NOW })
    expect(patterns.needed).toBe(PATTERN_RULES.minDecided - 3)
    expect(patterns.comparisons).toEqual([])
  })

  it("compare a segment with the rest only with enough on both sides", () => {
    const rows = [
      ...many(PATTERN_RULES.minGroup, { cv: "tailored", status: "SCREENING" }),
      ...many(PATTERN_RULES.minGroup - 1, { cv: "general", status: "REJECTED" }),
    ]
    const patterns = computePatterns(rows, { now: NOW })
    expect(patterns.needed).toBe(0)
    expect(patterns.comparisons.filter((row) => row.dimension === "cv")).toEqual([])
    expect(patterns.thin).toContain("cv")
  })

  it("name a difference of at least the threshold, with the counts behind it", () => {
    const rows = [
      // tailored: 6 of 10 replied; general: 2 of 10
      ...many(6, { cv: "tailored", status: "SCREENING" }),
      ...many(4, { cv: "tailored", status: "GHOSTED" }),
      ...many(2, { cv: "general", status: "INTERVIEW" }),
      ...many(8, { cv: "general", status: "GHOSTED" }),
    ]
    const patterns = computePatterns(rows, { now: NOW })
    const reply = patterns.comparisons.find(
      (row) => row.dimension === "cv" && row.metric === "reply"
    )
    expect(reply).toMatchObject({ value: "general", n: 10, hits: 2, restN: 10, restHits: 6 })
    expect(reply?.difference).toBeCloseTo(-0.4)
    expect(reply?.finding).toBe(true)
    // one comparison per metric for a dimension with two values, not a mirror of it
    expect(patterns.comparisons.filter((row) => row.dimension === "cv")).toHaveLength(2)
    const interview = patterns.comparisons.find(
      (row) => row.dimension === "cv" && row.metric === "interview"
    )
    expect(interview).toMatchObject({ hits: 2, restHits: 0, finding: true })
    expect(patterns.baseline.reply).toBeCloseTo(0.4)
  })

  it("do not name a smaller difference", () => {
    const rows = [
      ...many(5, { workplace: "REMOTE", status: "SCREENING" }),
      ...many(5, { workplace: "REMOTE", status: "GHOSTED" }),
      ...many(4, { workplace: "ONSITE", status: "SCREENING" }),
      ...many(6, { workplace: "ONSITE", status: "GHOSTED" }),
    ]
    const reply = computePatterns(rows, { now: NOW }).comparisons.find(
      (row) => row.dimension === "workplace" && row.metric === "reply"
    )
    expect(reply?.finding).toBe(false)
  })

  it("name the stage rejections cluster at", () => {
    const rows = [
      ...many(4, { status: "REJECTED", closedAtStage: "INTERVIEW" }),
      ...many(2, { status: "REJECTED", closedAtStage: "APPLIED" }),
    ]
    expect(computePatterns(rows, { now: NOW }).rejections).toEqual({
      stage: "INTERVIEW",
      n: 4,
      rejections: 6,
    })
    expect(computePatterns(rows.slice(0, 4), { now: NOW }).rejections).toBeNull()
  })
})

function followupApp(over: Partial<FollowupApplication>): FollowupApplication {
  counter += 1
  return {
    id: `f${counter}`,
    company: "Acme",
    title: "Backend",
    status: "APPLIED",
    appliedAt: daysAgo(3),
    statusChangedAt: daysAgo(3),
    nextStep: null,
    nextStepAt: null,
    events: [],
    ...over,
  }
}

describe("follow-ups", () => {
  it("wait a week after applying, then fall due, then go overdue, then cold", () => {
    const state = (days: number) =>
      followupFor(followupApp({ appliedAt: daysAgo(days), statusChangedAt: daysAgo(days) }), NOW)
        ?.state
    expect(state(6)).toBe("waiting")
    expect(state(7)).toBe("due")
    expect(state(14)).toBe("overdue")
    expect(state(COLD_AFTER_DAYS)).toBe("cold")
    expect(
      followupFor(followupApp({ appliedAt: daysAgo(30), statusChangedAt: daysAgo(30) }), NOW)
        ?.suggestStatus
    ).toBe("GHOSTED")
  })

  it("ask what is next three days after a reply, and a note restarts the wait", () => {
    const replied = followupApp({
      status: "INTERVIEW",
      appliedAt: daysAgo(20),
      statusChangedAt: daysAgo(3),
    })
    expect(followupFor(replied, NOW)?.state).toBe("due")
    const touched = followupApp({
      status: "INTERVIEW",
      appliedAt: daysAgo(20),
      statusChangedAt: daysAgo(10),
      events: [{ type: "note", toStatus: null, at: daysAgo(1), channel: "web" }],
    })
    expect(followupFor(touched, NOW)?.state).toBe("waiting")
  })

  it("follow the person's own date, and leave closed applications alone", () => {
    const own = followupFor(followupApp({ nextStepAt: daysAgo(2), appliedAt: daysAgo(1) }), NOW)
    expect(own).toMatchObject({ kind: "own-date", state: "overdue", daysOverdue: 2 })
    expect(followupFor(followupApp({ status: "REJECTED", appliedAt: daysAgo(40) }), NOW)).toBeNull()
  })

  it("list the most urgent first and count each state", () => {
    const list = computeFollowups(
      [
        followupApp({ appliedAt: daysAgo(7), statusChangedAt: daysAgo(7) }),
        followupApp({ appliedAt: daysAgo(15), statusChangedAt: daysAgo(15) }),
        followupApp({ appliedAt: daysAgo(2), statusChangedAt: daysAgo(2) }),
      ],
      { now: NOW }
    )
    expect(list.rows.map((row) => row.state)).toEqual(["overdue", "due"])
    expect(list.counts).toEqual({ overdue: 1, due: 1, cold: 0, total: 2 })
    expect(list.waiting).toBe(1)
  })
})
