import { describe, expect, it } from "vitest"
import { demandFromOffers, factSentence, phraseLabel, pickLatestRuns } from "./demand"

function offers(count: number, hit: number, text: string, rest = "General engineering work.") {
  return Array.from({ length: count }, (_, index) => ({
    title: "Head of Engineering",
    descriptionText: index < hit ? text : rest,
  }))
}

const role = (count: number, hit: number) => ({
  phrase: "Head of Engineering",
  offers: offers(count, hit, "We need budget ownership."),
})

describe("demand from offers", () => {
  it("counts phrase hits from the offers it is given", () => {
    const facts = demandFromOffers({ roles: [role(50, 31)], profileText: "TypeScript." })
    const budget = facts.find((fact) => fact.phrase === "budget ownership")
    expect(budget).toMatchObject({
      matchingOffers: 31,
      totalOffers: 50,
      percent: 62,
      presentInProfile: false,
      qualifies: true,
    })
    expect(factSentence(budget!)).toBe(
      "Head of Engineering offers in your results mention budget ownership in 62% of cases (31 of 50); this CV doesn't."
    )
    expect(factSentence(budget!, "pl")).toBe(
      "Oferty „Head of Engineering” w Twoich wynikach wspominają o tym: odpowiedzialność za budżet. To 62% przypadków (31 z 50), a w tym CV tego nie ma."
    )
    expect(phraseLabel(budget!, "pl")).toBe("odpowiedzialność za budżet")
    expect(facts.find((fact) => fact.phrase === "hiring or headcount")?.matchingOffers).toBe(0)
  })

  it("does not call a phrase missing when the text has it, in either language", () => {
    for (const profileText of ["I have budget ownership.", "Odpowiadam za budżet działu."]) {
      const fact = demandFromOffers({ roles: [role(50, 31)], profileText }).find(
        (entry) => entry.phrase === "budget ownership"
      )
      expect(fact?.qualifies).toBe(false)
      expect(fact?.presentInProfile).toBe(true)
    }
  })

  it("counts Polish offers", () => {
    const facts = demandFromOffers({
      roles: [{ phrase: "CTO", offers: offers(10, 6, "Rekrutacja do zespołu i budżet działu.") }],
      profileText: "TypeScript.",
    })
    expect(facts.find((fact) => fact.id === "cto:hiring")?.matchingOffers).toBe(6)
    expect(facts.find((fact) => fact.id === "cto:budget-ownership")?.matchingOffers).toBe(6)
  })

  it("stays quiet below the thresholds", () => {
    expect(demandFromOffers({ roles: [role(4, 4)], profileText: "" })).toHaveLength(0)
    const thin = demandFromOffers({ roles: [role(50, 4)], profileText: "" }).find(
      (fact) => fact.phrase === "budget ownership"
    )
    expect(thin?.qualifies).toBe(false)
  })

  it("uses the latest run per role", () => {
    const picked = pickLatestRuns([
      { phrase: "Head of Engineering", startedAt: new Date("2026-10-10T15:00:00Z"), runId: "old" },
      { phrase: "Head of Engineering", startedAt: new Date("2026-10-10T23:07:00Z"), runId: "new" },
      {
        phrase: "Principal Solution Architect",
        startedAt: new Date("2026-10-10T17:00:00Z"),
        runId: "other",
      },
    ])
    expect(picked.map((row) => row.runId).sort()).toEqual(["new", "other"])
  })
})
