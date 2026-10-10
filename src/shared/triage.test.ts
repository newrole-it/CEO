import { describe, expect, it } from "vitest"
import {
  latestDecisions,
  mergePlan,
  popUndo,
  pushUndo,
  swipeDecision,
  type UndoStep,
} from "./triage"

const step = (label: string, to: UndoStep["to"]): UndoStep => ({
  matchId: label,
  jobId: label,
  label,
  from: "undecided",
  to,
})

describe("offer triage", () => {
  it("undoes the newest decision first, then the one before it", () => {
    const stack = pushUndo(pushUndo([], step("first", "rejected")), step("second", "interested"))
    const once = popUndo(stack)
    expect(once.step?.label).toBe("second")
    const twice = popUndo(once.stack)
    expect(twice.step?.label).toBe("first")
    expect(popUndo(twice.stack).step).toBeNull()
  })

  it("keeps only the latest local decision for a job and does not clobber a newer server choice", () => {
    const local = latestDecisions([
      { jobId: "job-1", action: "rejected", at: 10 },
      { jobId: "job-1", action: "interested", at: 20 },
    ])
    expect(local).toEqual([{ jobId: "job-1", action: "interested", at: 20 }])
    const plan = mergePlan(local, [
      {
        id: "match-new",
        jobId: "job-1",
        interestedAt: null,
        dismissedAt: new Date(50),
      },
      {
        id: "match-open",
        jobId: "job-2",
        interestedAt: null,
        dismissedAt: null,
      },
    ])
    expect(plan).toEqual([])
    const filled = mergePlan(
      [
        { jobId: "job-2", action: "rejected", at: 5 },
        { jobId: "job-1", action: "rejected", at: 20 },
      ],
      [
        { id: "match-open", jobId: "job-2", interestedAt: null, dismissedAt: null },
        { id: "match-old", jobId: "job-1", interestedAt: new Date(1), dismissedAt: null },
      ]
    )
    expect(filled).toEqual([
      { id: "match-open", action: "rejected" },
      { id: "match-old", action: "rejected" },
    ])
  })

  it("treats a short drag as a cancel and a fling as a decision", () => {
    expect(swipeDecision(-20, 0)).toBeNull()
    expect(swipeDecision(-140, 0)).toBe("rejected")
    expect(swipeDecision(140, 0)).toBe("interested")
    expect(swipeDecision(-50, -0.9)).toBe("rejected")
    expect(swipeDecision(30, 0.2)).toBeNull()
  })
})
