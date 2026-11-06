import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { LlmClient } from "@newrole/llm/common"
import { improveSection } from "./improve"

type Call = { purpose: string; system: string; user: string; userId?: number }

function fakeLlm(...replies: unknown[]): LlmClient & { calls: Call[] } {
  const calls: Call[] = []
  return {
    model: "fake",
    calls,
    async completeJson(args) {
      calls.push({
        purpose: args.purpose,
        system: args.system,
        user: args.user,
        userId: args.userId,
      })
      const data = replies[Math.min(calls.length - 1, replies.length - 1)]
      if (data == null) return null
      return { data: args.schema.parse(data), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

describe("improveSection", () => {
  it("rewrites one section by the task asked and says what changed", async () => {
    const llm = fakeLlm({
      section: { id: "profile", body: "Prowadzę zespoły inżynierskie." },
      changes: ["Skróciłem profil."],
    })
    const result = await improveSection({
      llm,
      cv: syntheticCv(1),
      sectionId: "profile",
      mode: "shorten",
      language: "pl",
      context: "",
      userId: 7,
    })
    expect(result?.section).toMatchObject({ id: "profile", body: "Prowadzę zespoły inżynierskie." })
    expect(result?.changes).toEqual(["Skróciłem profil."])
    expect(llm.calls[0]).toMatchObject({ purpose: "cv-improve", userId: 7 })
    expect(llm.calls[0].system).toContain("about a third shorter")
    expect(llm.calls[0].user).toContain('<section>\n{"id":"profile"')
    expect(llm.calls[0].user).not.toContain("candidate_note")
  })

  it("counts the person's note as their facts", async () => {
    const llm = fakeLlm({
      section: { id: "profile", body: "Zarządzałem budżetem 2 mln zł." },
      changes: [],
    })
    const withNote = await improveSection({
      llm,
      cv: syntheticCv(1),
      sectionId: "profile",
      mode: "polish",
      note: "Dodaj, że zarządzałem budżetem 2 mln zł.",
      language: "pl",
      context: "",
    })
    expect(llm.calls[0].user).toContain("<untrusted_candidate_note>\nDodaj, że zarządzałem")
    expect(withNote?.reverted).toBe(0)

    const without = await improveSection({
      llm: fakeLlm({ section: { id: "profile", body: "Zarządzałem budżetem 2 mln zł." } }),
      cv: syntheticCv(1),
      sectionId: "profile",
      mode: "polish",
      language: "pl",
      context: "",
    })
    expect(without?.reverted).toBe(1)
  })

  it("returns null for another section's reply, an unknown section or no reply", async () => {
    const other = fakeLlm({ section: { id: "skills", items: [] }, changes: [] })
    const args = {
      cv: syntheticCv(1),
      mode: "polish" as const,
      language: "pl" as const,
      context: "",
    }
    expect(await improveSection({ ...args, llm: other, sectionId: "profile" })).toBeNull()
    expect(await improveSection({ ...args, llm: fakeLlm(null), sectionId: "profile" })).toBeNull()
    const unused = fakeLlm(null)
    expect(await improveSection({ ...args, llm: unused, sectionId: "nope" })).toBeNull()
    expect(unused.calls).toHaveLength(0)
  })
})
