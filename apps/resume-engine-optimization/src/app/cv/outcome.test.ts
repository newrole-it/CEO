import { describe, expect, it } from "vitest"
import { outcomeOf, summarize } from "./outcome"

describe("outcomeOf", () => {
  it("puts every live status in one bucket", () => {
    expect(outcomeOf("APPLIED")).toBe("waiting")
    expect(outcomeOf("SCREENING")).toBe("progress")
    expect(outcomeOf("INTERVIEW")).toBe("progress")
    expect(outcomeOf("TASK")).toBe("progress")
    expect(outcomeOf("FINAL")).toBe("progress")
    expect(outcomeOf("OFFER")).toBe("offer")
    expect(outcomeOf("ACCEPTED")).toBe("offer")
    expect(outcomeOf("REJECTED")).toBe("rejected")
    expect(outcomeOf("GHOSTED")).toBe("ghosted")
    expect(outcomeOf("WITHDRAWN")).toBe("withdrawn")
  })

  it("reads an unknown status as still waiting", () => {
    expect(outcomeOf("SOMETHING")).toBe("waiting")
  })
})

describe("summarize", () => {
  it("counts nothing for a CV never sent", () => {
    const summary = summarize([])
    expect(summary.total).toBe(0)
    expect(summary.replied).toBe(0)
    expect(summary.counts.offer).toBe(0)
  })

  it("counts each outcome and the employers who answered", () => {
    const summary = summarize([
      { status: "APPLIED", closedAtStage: null },
      { status: "INTERVIEW", closedAtStage: null },
      { status: "REJECTED", closedAtStage: "APPLIED" },
      { status: "GHOSTED", closedAtStage: null },
      { status: "OFFER", closedAtStage: null },
    ])
    expect(summary.total).toBe(5)
    expect(summary.counts).toEqual({
      offer: 1,
      progress: 1,
      waiting: 1,
      rejected: 1,
      ghosted: 1,
      withdrawn: 0,
    })
    // the interview, the rejection and the offer; silence and a pending one are no answer
    expect(summary.replied).toBe(3)
  })

  it("counts a withdrawal as answered only when the employer had replied before it", () => {
    expect(summarize([{ status: "WITHDRAWN", closedAtStage: "APPLIED" }]).replied).toBe(0)
    expect(summarize([{ status: "WITHDRAWN", closedAtStage: null }]).replied).toBe(0)
    expect(summarize([{ status: "WITHDRAWN", closedAtStage: "INTERVIEW" }]).replied).toBe(1)
  })
})
