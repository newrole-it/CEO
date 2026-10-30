import { describe, expect, it } from "vitest"
import { groupAnswers } from "./group"

const row = (
  id: string,
  questionKey: string,
  day: number,
  company: string | null = null,
  useCount = 1
) => ({
  id,
  questionKey,
  company,
  useCount,
  updatedAt: new Date(Date.UTC(2026, 9, day)).toISOString(),
})

describe("groupAnswers", () => {
  it("makes one entry per question, keeping the incoming order", () => {
    const groups = groupAnswers([
      row("a", "why us", 1),
      row("b", "notice", 9),
      row("c", "why us", 5),
    ])
    expect(groups.map((group) => group.key)).toEqual(["why us", "notice"])
  })

  it("represents a group by its newest variant and sums the uses", () => {
    const [group] = groupAnswers([
      row("a", "why us", 1, "Allegro", 3),
      row("c", "why us", 5, null, 2),
    ])
    expect(group.latest.id).toBe("c")
    expect(group.rows.map((item) => item.id)).toEqual(["c", "a"])
    expect(group.uses).toBe(5)
    expect(group.company).toBe("Allegro")
  })

  it("handles an empty list", () => {
    expect(groupAnswers([])).toEqual([])
  })
})
