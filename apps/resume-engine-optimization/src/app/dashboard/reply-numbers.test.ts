import { describe, expect, it } from "vitest"
import { computeInsights, type InsightApplication } from "src/server/applications/insights"
import { replyNumbers } from "./reply-numbers"

const NOW = new Date(2026, 9, 29, 15, 0, 0)

function daysAgo(days: number): string {
  const at = new Date(NOW)
  at.setDate(at.getDate() - days)
  return at.toISOString()
}

let counter = 0
function app(status: string, ...reached: string[]): InsightApplication {
  counter += 1
  const appliedAt = daysAgo(20)
  return {
    id: `a${counter}`,
    company: `Firma ${counter}`,
    title: "Engineering Manager",
    status,
    closedAtStage: null,
    appliedAt,
    statusChangedAt: appliedAt,
    nextStep: null,
    nextStepAt: null,
    source: "manual",
    jobId: null,
    events: [
      { type: "created", toStatus: "APPLIED", at: appliedAt, channel: "web" },
      ...reached.map((toStatus, index) => ({
        type: "status",
        toStatus,
        at: daysAgo(15 - index),
        channel: "web",
      })),
    ],
  }
}

describe("replyNumbers", () => {
  it("counts what was sent, answered, and reached an interview or an offer", () => {
    const applications = [
      app("APPLIED"),
      app("APPLIED"),
      app("SCREENING", "SCREENING"),
      app("INTERVIEW", "SCREENING", "INTERVIEW"),
    ]
    const insights = computeInsights(
      { applications, decisions: [], answers: [] },
      { weeks: null, now: NOW }
    )
    expect(replyNumbers(insights)).toEqual({ sent: 4, replied: 2, interviews: 1, offers: 0 })
  })

  it("is all zeros with no applications", () => {
    const insights = computeInsights(
      { applications: [], decisions: [], answers: [] },
      { weeks: null, now: NOW }
    )
    expect(replyNumbers(insights)).toEqual({ sent: 0, replied: 0, interviews: 0, offers: 0 })
  })
})
