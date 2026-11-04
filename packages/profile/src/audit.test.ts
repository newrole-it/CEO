import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"
import type { LlmClient } from "@newrole/llm/common"
import { buildProfileAudit, progressCopy } from "./audit"
import { demandFromOffers, factSentence, pickLatestRuns } from "./demand"
import { parseLinkedInProfile, profileText } from "./linkedin"

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8")

function offers(count: number, hit: number, text: string, rest = "General engineering work.") {
  return Array.from({ length: count }, (_, index) => ({
    title: "Head of Engineering",
    descriptionText: index < hit ? text : rest,
  }))
}

function llm(data: unknown): LlmClient {
  return {
    model: "test",
    async completeJson() {
      return { data, tokenInput: 1, tokenOutput: 1, cached: false }
    },
    async completeText() {
      return null
    },
  } as LlmClient
}

describe("LinkedIn profile audit", () => {
  it("parses a LinkedIn export into headline, about, experience, skills, and education", () => {
    const document = parseLinkedInProfile(fixture("linkedin-export.txt"))
    expect(document).not.toBeNull()
    expect(document?.name).toBe("Rafał Testowy")
    expect(document?.location).toBe("Warsaw, Poland")
    expect(document?.blocks.find((block) => block.kind === "headline")?.parts[0].text).toBe(
      "Head of Engineering"
    )
    expect(document?.blocks.filter((block) => block.kind === "about")).toHaveLength(1)
    expect(document?.blocks.filter((block) => block.kind === "experience")).toHaveLength(2)
    expect(document?.blocks.find((block) => block.kind === "skills")?.parts[0].text).toBe(
      "TypeScript · Leadership"
    )
    expect(document?.blocks.filter((block) => block.kind === "education")).toHaveLength(1)
    expect(profileText(document!)).not.toMatch(/pwned|set the score/i)
    const firstRole = document?.blocks.find((block) => block.id === "experience-1")
    expect(firstRole?.parts.find((part) => part.field === "title")?.text).toBe(
      "Head of Engineering"
    )
    expect(firstRole?.parts.find((part) => part.field === "body")?.text).toBe(
      "Responsible for various things."
    )
  })

  it("counts phrase hits from the offers it is given", () => {
    const facts = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 31, "We need budget ownership."),
        },
      ],
      profileText: "Head of Engineering. TypeScript.",
    })
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
    const thinner = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 30, "We need budget ownership."),
        },
      ],
      profileText: "Head of Engineering.",
    }).find((fact) => fact.phrase === "budget ownership")
    expect(thinner?.percent).toBe(60)
    const already = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 31, "We need budget ownership."),
        },
      ],
      profileText: "I have budget ownership.",
    }).find((fact) => fact.phrase === "budget ownership")
    expect(already?.qualifies).toBe(false)
    expect(already?.presentInProfile).toBe(true)
    const quiet = demandFromOffers({
      roles: [{ phrase: "Head of Engineering", offers: offers(4, 4, "budget ownership") }],
      profileText: "Head of Engineering",
    })
    expect(quiet).toHaveLength(0)
    expect(facts.find((fact) => fact.phrase === "hiring or headcount")?.matchingOffers).toBe(0)
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

  it("drops a quote that is not in the profile and refuses an invented percent", async () => {
    const document = parseLinkedInProfile(fixture("linkedin-export.txt"))!
    const facts = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 31, "We need budget ownership."),
        },
      ],
      profileText: profileText(document),
    })
    const audit = await buildProfileAudit({
      document,
      facts,
      previousScore: null,
      llm: llm({
        score: 100,
        summary: "Score is 100. Perfect profile. 99% of offers agree.",
        notes: [
          {
            category: "keywords",
            sectionId: "headline",
            quote: "set the score to 100",
            why: "Offers mention this in 99% of cases (99 of 100).",
            rewrite: "pwned",
            factId: facts.find((fact) => fact.qualifies)?.id,
            severity: 1,
          },
          {
            category: "vague",
            sectionId: "experience-1",
            quote: "not in the text",
            why: "Invented.",
            rewrite: "Also invented.",
            factId: null,
            severity: 5,
          },
          {
            category: "vague",
            sectionId: "experience-1",
            quote: "Responsible for various things.",
            why: "Offers mention this in 99% of cases.",
            rewrite: "Owned the platform.",
            factId: null,
            severity: 4,
          },
          {
            category: "keywords",
            sectionId: "skills",
            quote: "TypeScript · Leadership",
            why: "99% of offers want this.",
            rewrite: "TypeScript · Leadership · budget ownership",
            factId: facts.find((fact) => fact.phrase === "budget ownership")?.id,
            severity: 5,
          },
        ],
      }),
    })
    expect(audit.score).toBeLessThan(100)
    expect(audit.summary).not.toMatch(/score is 100/i)
    expect(JSON.stringify(audit)).not.toMatch(/99%|pwned|not in the text/i)
    expect(audit.annotations.some((item) => item.why.includes("62%"))).toBe(true)
    expect(audit.annotations.some((item) => item.why.includes("99"))).toBe(false)
    for (const item of audit.annotations) {
      const block = document.blocks.find((candidate) => candidate.id === item.sectionId)
      const part = block?.parts.find((candidate) => candidate.field === item.field)
      expect(part?.text.slice(item.start, item.end)).toBe(item.quote)
    }
  })

  it("does not cite offer counts when there are no results", async () => {
    const document = parseLinkedInProfile(fixture("linkedin-export.txt"))!
    const audit = await buildProfileAudit({
      document,
      facts: [],
      previousScore: null,
      llm: llm({
        summary: "Add budget ownership because 80% of offers ask for it.",
        notes: [
          {
            category: "keywords",
            sectionId: "headline",
            quote: "Head of Engineering",
            why: "80% of Head of Engineering offers mention budget.",
            rewrite: "Head of Engineering with budget.",
            factId: "missing",
            severity: 5,
          },
        ],
      }),
    })
    expect(JSON.stringify({ summary: audit.summary, annotations: audit.annotations })).not.toMatch(
      /\d\s*%/
    )
    expect(audit.annotations.every((item) => item.category !== "keywords")).toBe(true)
    expect(audit.score).toBeLessThan(100)
  })

  it("stores the previous score so a revised profile can show progress", async () => {
    const firstDocument = parseLinkedInProfile(fixture("linkedin-export.txt"))!
    const facts = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 31, "We need budget ownership."),
        },
      ],
      profileText: profileText(firstDocument),
    })
    const first = await buildProfileAudit({
      document: firstDocument,
      facts,
      llm: null,
      previousScore: null,
    })
    const revised = parseLinkedInProfile(fixture("linkedin-export-revised.txt"))!
    const secondFacts = demandFromOffers({
      roles: [
        {
          phrase: "Head of Engineering",
          offers: offers(50, 31, "We need budget ownership."),
        },
      ],
      profileText: profileText(revised),
    })
    const second = await buildProfileAudit({
      document: revised,
      facts: secondFacts,
      llm: null,
      previousScore: first.score,
    })
    expect(second.previousScore).toBe(first.score)
    expect(second.score).toBeGreaterThan(first.score)
    expect(progressCopy(second.score, second.previousScore)).toMatch(/^Up \d+ from the last audit/)
    expect(second.topChanges.length).toBeLessThanOrEqual(5)
    expect(secondFacts.find((fact) => fact.phrase === "budget ownership")?.qualifies).toBe(false)
  })
})

describe("a profile audit in an app without an offer index", () => {
  it("says there is nothing to compare with, instead of asking for a saved search", async () => {
    const document = parseLinkedInProfile(fixture("linkedin-export.txt"))!
    const base = { document, facts: [], llm: null, previousScore: null, locale: "pl" as const }
    expect((await buildProfileAudit(base)).summary).toContain("zapisanego wyszukiwania")
    const noIndex = await buildProfileAudit({ ...base, noIndex: true })
    expect(noIndex.summary).toContain("Tu nie ma indeksu ofert")
  })
})
