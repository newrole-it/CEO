import { describe, expect, it } from "vitest"
import {
  addWeeks,
  computeInsights,
  firstReplyAt,
  median,
  reachedStage,
  weekStart,
  type InsightApplication,
  type InsightsInput,
} from "./insights"

// Thursday 29 October 2026, 15:00 local time: mid-week, so week math has room on both sides.
const NOW = new Date(2026, 9, 29, 15, 0, 0)

function daysAgo(days: number, hour = 12): string {
  const at = new Date(NOW)
  at.setDate(at.getDate() - days)
  at.setHours(hour, 0, 0, 0)
  return at.toISOString()
}

function daysAhead(days: number): string {
  return daysAgo(-days)
}

let counter = 0
function app(over: Partial<InsightApplication>): InsightApplication {
  counter += 1
  const appliedAt = over.appliedAt ?? daysAgo(10)
  return {
    id: `a${counter}`,
    company: `Firma ${counter}`,
    title: "Engineering Manager",
    status: "APPLIED",
    closedAtStage: null,
    appliedAt,
    statusChangedAt: appliedAt,
    nextStep: null,
    nextStepAt: null,
    source: "manual",
    jobId: null,
    events: [{ type: "created", toStatus: "APPLIED", at: appliedAt, channel: "web" }],
    ...over,
  }
}

function status(toStatus: string, at: string, channel = "web") {
  return { type: "status", toStatus, at, channel }
}

const empty: InsightsInput = { applications: [], decisions: [], answers: [] }

describe("weekStart", () => {
  it("starts weeks on Monday at local midnight", () => {
    const monday = weekStart(NOW)
    expect(monday.getDay()).toBe(1)
    expect(monday.getHours()).toBe(0)
    expect(monday.getDate()).toBe(26)
    // Sunday belongs to the week that started six days earlier
    const sunday = new Date(2026, 10, 1, 23, 30)
    expect(weekStart(sunday).getDate()).toBe(26)
    expect(weekStart(new Date(2026, 10, 2, 0, 0)).getDate()).toBe(2)
  })

  it("moves by whole local days across the DST change", () => {
    // Poland leaves summer time on 25 October 2026
    const before = weekStart(new Date(2026, 9, 20))
    const after = addWeeks(before, 1)
    expect(after.getHours()).toBe(0)
    expect(after.getDate()).toBe(26)
  })
})

describe("reachedStage and firstReplyAt", () => {
  it("reads the furthest stage from the timeline, the status and the closing stage", () => {
    expect(reachedStage(app({}))).toBe(0)
    expect(reachedStage(app({ status: "INTERVIEW" }))).toBe(2)
    expect(reachedStage(app({ status: "ACCEPTED" }))).toBe(5)
    expect(reachedStage(app({ status: "REJECTED", closedAtStage: "TASK" }))).toBe(3)
    // went to FINAL, then was moved back to INTERVIEW: the furthest stage still counts
    const applied = daysAgo(20)
    expect(
      reachedStage(
        app({
          status: "INTERVIEW",
          events: [
            status("SCREENING", applied),
            status("FINAL", daysAgo(5)),
            status("INTERVIEW", daysAgo(1)),
          ],
        })
      )
    ).toBe(4)
  })

  it("dates the first reply from the timeline and falls back to the status change", () => {
    const applied = daysAgo(20)
    const withTimeline = app({
      appliedAt: applied,
      status: "INTERVIEW",
      statusChangedAt: daysAgo(2),
      events: [
        { type: "created", toStatus: "APPLIED", at: applied, channel: "web" },
        status("SCREENING", daysAgo(14)),
        status("INTERVIEW", daysAgo(2)),
      ],
    })
    expect(firstReplyAt(withTimeline)?.toISOString()).toBe(daysAgo(14))
    const migrated = app({
      appliedAt: applied,
      status: "REJECTED",
      statusChangedAt: daysAgo(3),
      events: [],
    })
    expect(firstReplyAt(migrated)?.toISOString()).toBe(daysAgo(3))
    expect(firstReplyAt(app({}))).toBeNull()
    // withdrawing before anyone answered is not a reply
    expect(
      firstReplyAt(app({ status: "WITHDRAWN", closedAtStage: "APPLIED", events: [] }))
    ).toBeNull()
  })
})

describe("computeInsights", () => {
  it("is empty but well-formed without data", () => {
    const out = computeInsights(empty, { now: NOW, weeks: 12 })
    expect(out.sent).toBe(0)
    expect(out.perWeek).toBeNull()
    expect(out.rates).toEqual({ response: null, interview: null, offer: null })
    expect(out.weekly).toHaveLength(12)
    expect(out.funnel.map((row) => row.reached)).toEqual([0, 0, 0, 0, 0, 0])
    expect(out.dropOff).toEqual([])
    expect(out.sources).toEqual([])
    expect(out.waiting).toEqual([])
    expect(out.upcoming).toEqual([])
    expect(out.truncated).toBe(false)
  })

  it("builds the funnel, the rates and where applications drop out", () => {
    const input: InsightsInput = {
      applications: [
        app({ appliedAt: daysAgo(30), source: "nowarola", jobId: "j1" }),
        app({
          appliedAt: daysAgo(28),
          status: "REJECTED",
          closedAtStage: "INTERVIEW",
          statusChangedAt: daysAgo(10),
          source: "extension",
          events: [
            status("SCREENING", daysAgo(21)),
            status("INTERVIEW", daysAgo(15)),
            status("REJECTED", daysAgo(10)),
          ],
        }),
        app({
          appliedAt: daysAgo(25),
          status: "OFFER",
          statusChangedAt: daysAgo(1),
          source: "extension",
          events: [
            status("INTERVIEW", daysAgo(18)),
            status("FINAL", daysAgo(6)),
            status("OFFER", daysAgo(1)),
          ],
        }),
        app({ appliedAt: daysAgo(20), status: "GHOSTED", statusChangedAt: daysAgo(2), events: [] }),
        app({
          appliedAt: daysAgo(9),
          status: "REJECTED",
          statusChangedAt: daysAgo(4),
          events: [status("REJECTED", daysAgo(4))],
        }),
        app({
          appliedAt: daysAgo(3),
          status: "WITHDRAWN",
          closedAtStage: "SCREENING",
          statusChangedAt: daysAgo(1),
          events: [status("SCREENING", daysAgo(2)), status("WITHDRAWN", daysAgo(1))],
        }),
      ],
      decisions: [],
      answers: [],
    }
    const out = computeInsights(input, { now: NOW, weeks: 12 })
    expect(out.sent).toBe(6)
    // screening or further: the rejection after interviews, the offer, the withdrawal after a screen
    expect(out.funnel.map((row) => [row.stage, row.reached])).toEqual([
      ["APPLIED", 6],
      ["SCREENING", 3],
      ["INTERVIEW", 2],
      ["TASK", 1],
      ["FINAL", 1],
      ["OFFER", 1],
    ])
    expect(out.funnel[1].fromPrevious).toBeCloseTo(3 / 6)
    expect(out.funnel[2].fromPrevious).toBeCloseTo(2 / 3)
    expect(out.funnel[0].fromPrevious).toBeNull()
    // replies: the two rejections, the offer and the withdrawal after a screening
    expect(out.rates.response).toBeCloseTo(4 / 6)
    expect(out.rates.interview).toBeCloseTo(2 / 6)
    expect(out.rates.offer).toBeCloseTo(1 / 6)
    expect(out.outcomes).toEqual({ accepted: 0, rejected: 2, withdrawn: 1, ghosted: 1 })
    // a rejection with no recorded stage dropped at APPLIED
    expect(out.dropOff).toEqual([
      { stage: "APPLIED", rejected: 1, withdrawn: 0 },
      { stage: "SCREENING", rejected: 0, withdrawn: 1 },
      { stage: "INTERVIEW", rejected: 1, withdrawn: 0 },
    ])
    expect(out.timing.medianDaysToReply).toBe(6) // 7, 7, 5, 1 → (5 + 7) / 2
    expect(out.timing.medianDaysToRejection).toBe(12) // 18 and 5 → 11.5 → 12
    expect(out.fromIndex).toBe(1)
  })

  it("buckets weeks from Monday, keeps replies with the week they were sent", () => {
    const input: InsightsInput = {
      applications: [
        app({ appliedAt: daysAgo(1) }), // this week
        app({ appliedAt: daysAgo(3) }), // Monday of this week
        app({
          appliedAt: daysAgo(8), // last week
          status: "SCREENING",
          statusChangedAt: daysAgo(1),
          events: [status("SCREENING", daysAgo(1))],
        }),
        app({ appliedAt: daysAgo(40) }), // outside a 4-week range
      ],
      decisions: [
        { verdict: "LIKE", createdAt: daysAgo(2), withReason: true },
        { verdict: "DISLIKE", createdAt: daysAgo(2), withReason: false },
        { verdict: "APPLIED", createdAt: daysAgo(9), withReason: false },
        { verdict: "LIKE", createdAt: daysAgo(60), withReason: true },
      ],
      answers: [],
    }
    const out = computeInsights(input, { now: NOW, weeks: 4 })
    expect(out.sent).toBe(3)
    expect(out.weekly).toHaveLength(4)
    expect(out.weekly.map((week) => week.sent)).toEqual([0, 0, 1, 2])
    expect(out.weekly.map((week) => week.sentReplied)).toEqual([0, 0, 1, 0])
    expect(out.weekly.map((week) => [week.liked, week.passed, week.applied])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 1],
      [1, 1, 0],
    ])
    expect(new Date(out.weekly[3].weekStart).getDate()).toBe(26)
    expect(out.decisions).toEqual({ liked: 1, passed: 1, applied: 1, withReason: 1, total: 3 })
    expect(out.perWeek).toBe(0.8)
    expect(out.from).toBe(addWeeks(weekStart(NOW), -3).toISOString())
  })

  it("covers everything since the first record when no range is given, capping the chart", () => {
    const input: InsightsInput = {
      applications: [app({ appliedAt: daysAgo(7 * 60) }), app({ appliedAt: daysAgo(2) })],
      decisions: [],
      answers: [],
    }
    const out = computeInsights(input, { now: NOW, weeks: null })
    expect(out.from).toBeNull()
    expect(out.sent).toBe(2)
    expect(out.spanWeeks).toBe(61)
    expect(out.weekly).toHaveLength(52)
    expect(out.truncated).toBe(true)
    expect(out.weekly.reduce((sum, week) => sum + week.sent, 0)).toBe(1)
  })

  it("lists what waits longest and what comes next, regardless of the range", () => {
    const input: InsightsInput = {
      applications: [
        app({ company: "Stare", appliedAt: daysAgo(90) }),
        app({ company: "Średnie", appliedAt: daysAgo(20) }),
        app({ company: "Świeże", appliedAt: daysAgo(5) }),
        app({
          company: "Odpowiedziało",
          appliedAt: daysAgo(40),
          status: "INTERVIEW",
          events: [status("INTERVIEW", daysAgo(30))],
        }),
        app({
          company: "Jutro",
          appliedAt: daysAgo(10),
          status: "INTERVIEW",
          nextStep: "Rozmowa z CTO",
          nextStepAt: daysAhead(1),
        }),
        app({
          company: "Zaległe",
          appliedAt: daysAgo(12),
          status: "SCREENING",
          nextStep: "Zadanie",
          nextStepAt: daysAgo(2),
        }),
        app({
          company: "Daleko",
          appliedAt: daysAgo(12),
          status: "SCREENING",
          nextStepAt: daysAhead(20),
        }),
        app({
          company: "Zamknięte",
          appliedAt: daysAgo(12),
          status: "REJECTED",
          nextStepAt: daysAhead(1),
          events: [],
        }),
      ],
      decisions: [],
      answers: [],
    }
    const out = computeInsights(input, { now: NOW, weeks: 4 })
    expect(out.waiting.map((row) => [row.company, row.days])).toEqual([
      ["Stare", 90],
      ["Średnie", 20],
    ])
    expect(out.upcoming.map((row) => [row.company, row.overdue])).toEqual([
      ["Zaległe", true],
      ["Jutro", false],
    ])
  })

  it("measures how much of the process runs by itself", () => {
    const input: InsightsInput = {
      applications: [
        app({
          source: "extension",
          status: "SCREENING",
          events: [status("SCREENING", daysAgo(2), "gmail")],
        }),
        app({
          source: "nowarola",
          status: "TASK",
          events: [status("INTERVIEW", daysAgo(2), "mcp"), status("TASK", daysAgo(1), "web")],
        }),
        app({ source: "manual" }),
        app({ source: "gmail" }),
      ],
      decisions: [],
      answers: [
        { origin: "manual", useCount: 1 },
        { origin: "extension", useCount: 3 },
        { origin: "draft", useCount: 1 },
      ],
    }
    const out = computeInsights(input, { now: NOW, weeks: 12 })
    expect(out.automation.tracked).toBe(4)
    expect(out.automation.autoTracked).toBe(3)
    expect(out.automation.byChannel).toEqual({ web: 1, mcp: 1, extension: 0, gmail: 1, sheet: 0 })
    expect(out.automation.answersTotal).toBe(3)
    expect(out.automation.answersReused).toBe(2)
    expect(out.sources.map((row) => [row.source, row.sent, row.replied])).toEqual([
      ["nowarola", 1, 1],
      ["extension", 1, 1],
      ["manual", 1, 0],
      ["gmail", 1, 0],
    ])
    expect(out.sources[0].responseRate).toBe(1)
    expect(out.sources[2].responseRate).toBe(0)
  })
})

describe("median", () => {
  it("rounds the middle value", () => {
    expect(median([])).toBeNull()
    expect(median([3])).toBe(3)
    expect(median([1, 4])).toBe(3)
    expect(median([9, 1, 5])).toBe(5)
  })
})
