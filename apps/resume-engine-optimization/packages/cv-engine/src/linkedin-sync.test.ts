import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { LlmClient } from "@newrole/llm/common"
import type { LinkedInDocument } from "@newrole/profile/linkedin"
import { compareWithLinkedIn, LINKEDIN_LIMITS, writeLinkedInTexts } from "./linkedin-sync"

const linkedIn: LinkedInDocument = {
  name: "Anna Przykładowa",
  location: "Łódź",
  blocks: [
    {
      id: "h",
      kind: "headline",
      label: "Headline",
      parts: [{ field: "body", text: "Engineering Leader" }],
    },
    {
      id: "e1",
      kind: "experience",
      label: "Experience",
      parts: [
        { field: "title", text: "Head of Engineering" },
        { field: "subtitle", text: "Przykładowa Firma 1 · 02.2011 – 02.2012" },
      ],
    },
    {
      id: "e2",
      kind: "experience",
      label: "Experience",
      parts: [
        { field: "title", text: "Doradca" },
        { field: "subtitle", text: "Inna Firma · 2020 – 2021" },
      ],
    },
    {
      id: "s",
      kind: "skills",
      label: "Skills",
      parts: [{ field: "body", text: "Node.js · Kubernetes" }],
    },
  ],
}

function fakeLlm(reply: unknown): LlmClient {
  return {
    model: "fake",
    async completeJson(args) {
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

describe("compareWithLinkedIn", () => {
  it("pairs roles by company and lists what differs", () => {
    const comparison = compareWithLinkedIn(syntheticCv(2), linkedIn)
    expect(
      comparison.roles.map((role) => [
        role.company,
        Boolean(role.linkedIn),
        role.titleSame,
        role.yearsSame,
      ])
    ).toEqual([
      ["Przykładowa Firma 1", true, true, true],
      ["Przykładowa Firma 2", false, false, false],
    ])
    expect(comparison.onlyOnLinkedIn).toEqual([
      { title: "Doradca", subtitle: "Inna Firma · 2020 – 2021" },
    ])
    expect(comparison.skillsMissing).toContain("PostgreSQL")
    expect(comparison.skillsMissing).not.toContain("Node.js")
    expect(comparison.linkedInSkills).toBe(2)
    expect(comparison.headline.linkedIn).toBe("Engineering Leader")
    expect(comparison.aboutChars).toBeNull()
  })
})

describe("writeLinkedInTexts", () => {
  it("keeps the limits and leaves out what the data does not back", async () => {
    const cv = syntheticCv(2)
    const texts = await writeLinkedInTexts({
      llm: fakeLlm({
        headline: `Head of Engineering | Node.js, PostgreSQL | ${"platformy dla dużych zespołów ".repeat(
          10
        )}`,
        about:
          "Kieruję zespołami inżynierskimi.\n\nPodniosłam sprzedaż o 40%.\n\nKey skills: Node.js, PostgreSQL",
        roles: [
          {
            item: "job1",
            description: "Prowadziłem zespół programistów.",
            bullets: ["Zatrudniłem 12 osób.", "Zbudowałem platformę."],
          },
        ],
        skills: ["Node.js", "Rust", "PostgreSQL"],
      }),
      cv,
      context: "",
      language: "pl",
    })
    expect(texts?.headline).toBe("Head of Engineering | Node.js, PostgreSQL")
    expect(texts!.headline.length).toBeLessThanOrEqual(LINKEDIN_LIMITS.headline)
    expect(texts?.about).toBe("Kieruję zespołami inżynierskimi.\n\nKey skills: Node.js, PostgreSQL")
    expect(texts?.roles[0].bullets).toEqual(["Zbudowałem platformę."])
    expect(texts?.skills).toEqual(["Node.js", "PostgreSQL"])
    expect(texts?.dropped).toBe(2)
  })
})
