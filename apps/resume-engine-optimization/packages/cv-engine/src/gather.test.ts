import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { OwnChange } from "@newrole/cv-core/own-changes"
import type { CvExperienceSection } from "@newrole/cv-core/schema"
import type { LlmClient } from "@newrole/llm/common"
import { gatherCv, type GatherSourceInput } from "./gather"

type Call = { purpose: string; system: string; user: string; userId?: number }

function fakeLlm(reply: unknown): LlmClient & { calls: Call[] } {
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
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const NEW_BULLET = "Wdrożyłem kolejkę zdarzeń opartą na Kafce dla zespołu płatności."
const cv = syntheticCv(2)
const first = cv.sections.find(
  (section): section is CvExperienceSection => section.type === "experience"
)!.items[0]

const change: OwnChange = {
  kind: "bullets",
  section: { id: "experience", type: "experience", title: "Doświadczenie zawodowe" },
  item: { id: "job1", label: "Przykładowa Firma 1 · Head of Engineering" },
  added: [NEW_BULLET],
}
const source: GatherSourceInput = {
  title: 'CV "Sklep" <backend>',
  company: "Sklep Przykładowy",
  role: "Staff Engineer",
  language: "pl",
  changes: [change],
  text: NEW_BULLET,
}
const reply = {
  sections: [
    { id: "experience", items: [{ id: "job1", bullets: [...first.bullets, NEW_BULLET] }] },
  ],
  notes: [{ source: source.title, outcome: "added", text: "Dodałem punkt o Kafce." }],
}
const input = {
  cv,
  language: "pl" as const,
  locale: "en" as const,
  sources: [source],
  context: "",
  userId: 7,
}

describe("gatherCv", () => {
  it("names the languages and carries each source's changes and title", async () => {
    const llm = fakeLlm(reply)
    await gatherCv({ ...input, llm })
    const [call] = llm.calls
    expect(call).toMatchObject({ purpose: "cv-gather", userId: 7 })
    expect(call.user).toContain("Write in: Polish")
    expect(call.user).toContain("Language for notes: English")
    expect(call.user).toContain(
      '<source title="CV &quot;Sklep&quot; &lt;backend&gt;" written_for="Sklep Przykładowy · Staff Engineer" language="pl">'
    )
    expect(call.user).toContain(JSON.stringify([change]))
    expect(call.user).toContain('"id":"job1"')
    expect(call.system).toContain("keep the CV's line")
  })

  it("applies the reply: the new bullet is in the draft and the notes come back", async () => {
    const draft = await gatherCv({ ...input, llm: fakeLlm(reply) })
    const role = draft!.content.sections.find(
      (section): section is CvExperienceSection => section.type === "experience"
    )!.items[0]
    expect(role.bullets).toEqual([...first.bullets, NEW_BULLET])
    expect(draft!.notes).toEqual(reply.notes)
    expect(draft!.reverted).toBe(0)
  })

  it("counts a source's text as evidence for its numbers", async () => {
    const bullet = "Skróciłem czas wdrożenia o 73%."
    const numbered = { ...source, changes: [{ ...change, added: [bullet] }], text: bullet }
    const llm = fakeLlm({
      sections: [
        { id: "experience", items: [{ id: "job1", bullets: [...first.bullets, bullet] }] },
      ],
      notes: [],
    })
    const draft = await gatherCv({ ...input, sources: [numbered], llm })
    expect(draft!.reverted).toBe(0)
    expect(JSON.stringify(draft!.content)).toContain("73%")
  })

  it("gives null when the model gives nothing", async () => {
    expect(await gatherCv({ ...input, llm: fakeLlm(null) })).toBeNull()
  })

  it("gives null when the reply makes an invalid CV", async () => {
    const bullets = Array.from({ length: 41 }, (_, index) => `Punkt ${"i".repeat(index + 1)}.`)
    const llm = fakeLlm({ sections: [{ id: "experience", items: [{ id: "job1", bullets }] }] })
    expect(await gatherCv({ ...input, llm })).toBeNull()
  })

  it("does not call the model without sources", async () => {
    const llm = fakeLlm(reply)
    expect(await gatherCv({ ...input, sources: [], llm })).toBeNull()
    expect(llm.calls).toHaveLength(0)
  })
})
