import { describe, expect, it } from "vitest"
import { rejectionPenalty } from "./feedback"

describe("rejection feedback", () => {
  it("lowers a similar offer a little and leaves an unrelated offer alone", () => {
    const rejected = [{ title: "Head of Engineering", company: "Acme" }]
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Other" }, rejected)).toBe(-7)
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Acme" }, rejected)).toBe(-8)
    expect(rejectionPenalty({ title: "Accountant", company: "Acme" }, rejected)).toBe(0)
    expect(rejectionPenalty({ title: "Head of Engineering", company: "Acme" }, [])).toBe(0)
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
