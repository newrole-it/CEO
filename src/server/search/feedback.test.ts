import { describe, expect, it } from "vitest"
import { modelFromRows } from "src/server/preferences/model"
import { feedbackAdjustment, rejectionPenalty } from "./feedback"

describe("rejection feedback", () => {
  it("lowers a similar offer a little and leaves an unrelated offer alone", () => {
    const rejected = [{ title: "Head of Engineering", company: "Acme" }]
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Other" }, rejected)).toBe(-7)
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Acme" }, rejected)).toBe(-8)
    expect(rejectionPenalty({ title: "Accountant", company: "Acme" }, rejected)).toBe(0)
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Acme" }, [])).toBe(0)
  })

  it("combines with the preference model without stacking two penalties", () => {
    const now = new Date("2026-10-28T12:00:00Z")
    const passed = {
      title: "Head of Engineering",
      description: "",
      company: "Acme",
      workplaceType: "ONSITE",
      locationText: "Kraków",
    }
    const model = modelFromRows({
      userId: 1,
      locale: "pl",
      now,
      rows: [
        {
          jobId: "r1",
          verdict: "DISLIKE",
          aspects: [],
          tags: [],
          muted: [],
          updatedAt: now,
          offer: passed,
        },
      ],
    })
    const rejected = [{ jobId: "r1", title: "Head of Engineering", company: "Acme" }]
    const offer = { ...passed, id: "o1" }
    const both = feedbackAdjustment({ offer, rejected, model })
    const penaltyOnly = feedbackAdjustment({ offer, rejected, model: null })
    expect(penaltyOnly.delta).toBe(-8)
    expect(both.delta).toBeLessThanOrEqual(-8)
    expect(both.delta).toBeGreaterThanOrEqual(-12)
    expect(both.reasons[0]).toMatch(/^Podobne do odrzuconej/)
    // The offer itself never penalises itself.
    expect(feedbackAdjustment({ offer: { ...offer, id: "r1" }, rejected, model: null }).delta).toBe(
      0
    )
  })

  it("never drops more than 8 points", () => {
    const rejected = [
      { title: "Head of Engineering", company: "Acme" },
      { title: "Head of Engineering, Platform", company: "Acme" },
    ]
    const penalty = rejectionPenalty({ title: "Head of Engineering", company: "Acme" }, rejected)
    expect(penalty).toBeGreaterThanOrEqual(-8)
    expect(penalty).toBeLessThan(0)
  })
})
