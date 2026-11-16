import { describe, expect, it } from "vitest"
import type { LlmClient } from "@newrole/llm/common"
import { briefFromOffer, researchOnWeb, WEB_SEARCH_CAP, WEB_TOOLS, type WebRun } from "./research"

const OFFER = "Acme builds warehouse robots. We are migrating our fleet software to Go services."

function fakeLlm(reply: unknown) {
  const asked: { purpose: string; user: string; system: string }[] = []
  const llm = {
    model: "fake",
    async completeJson(args) {
      asked.push({ purpose: args.purpose, user: args.user, system: args.system })
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  } as LlmClient
  return { llm, asked }
}

describe("briefFromOffer", () => {
  it("asks once with the purpose, names the output language, and keeps only what the offer holds", async () => {
    const { llm, asked } = fakeLlm({
      points: [
        {
          axis: "challenges",
          text: "Przenoszą oprogramowanie floty do Go.",
          quote: "migrating our fleet software to Go services",
        },
        { axis: "strategy", text: "Sprzedają w USA.", quote: "sells robots in the United States" },
      ],
    })
    const brief = await briefFromOffer({
      llm,
      offer: { company: "Acme", title: "Backend engineer", text: OFFER },
      context: "Go developer",
      evidence: "Go developer",
      locale: "pl",
      userId: 7,
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]!.purpose).toBe("company-brief")
    expect(asked[0]!.user).toContain("Language for notes: Polish.")
    expect(brief?.points.map((point) => point.text)).toEqual([
      "Przenoszą oprogramowanie floty do Go.",
    ])
    expect(brief?.dropped.offer).toBe(1)
  })
  it("does not call the model for an offer without text, and is null for an unreadable reply", async () => {
    const empty = fakeLlm({})
    const input = { context: "", evidence: "", locale: "en" as const }
    expect(
      await briefFromOffer({
        ...input,
        llm: empty.llm,
        offer: { company: "A", title: "T", text: " " },
      })
    ).toBeNull()
    expect(empty.asked).toHaveLength(0)
    const none = fakeLlm(null)
    expect(
      await briefFromOffer({
        ...input,
        llm: none.llm,
        offer: { company: "A", title: "T", text: OFFER },
      })
    ).toBeNull()
  })
})

describe("researchOnWeb", () => {
  const quote = "Acme opened a new engineering office in Kraków this spring"
  function fakeRun(text: string | null, searches = 2) {
    const calls: Parameters<WebRun>[0][] = []
    const run: WebRun = async (args) => {
      calls.push(args)
      for (let i = 0; i < searches; i += 1) args.onEvent({ kind: "tool_use", name: "WebSearch" })
      args.onEvent({ kind: "tool_use", name: "WebFetch" })
      return text === null ? null : { text }
    }
    return { run, calls }
  }
  const input = {
    company: { name: "Acme", aliases: [], domain: "acme.example" },
    title: "Backend engineer",
    offerUrls: ["https://jobs.example/acme/1"],
    locale: "en" as const,
    today: new Date("2026-11-16T00:00:00Z"),
  }

  it("runs with the web tools only, sends nothing about the person, counts searches and screens claims", async () => {
    const reply = JSON.stringify({
      points: [
        {
          axis: "moves",
          text: "Acme opened an office in Kraków.",
          url: "https://news.example/a",
          quote,
        },
        { axis: "moves", text: "Same, from the offer.", url: "https://jobs.example/acme/1", quote },
      ],
    })
    const { run, calls } = fakeRun(`Here it is:\n${reply}`, 3)
    const research = await researchOnWeb({ ...input, run })
    expect(calls).toHaveLength(1)
    expect(calls[0]!.allowedTools).toEqual(WEB_TOOLS)
    expect(calls[0]!.system).toContain(`at most ${WEB_SEARCH_CAP} searches`)
    expect(calls[0]!.prompt).toContain("Company: Acme")
    expect(research).toEqual({
      claims: [
        {
          axis: "moves",
          text: "Acme opened an office in Kraków.",
          url: "https://news.example/a",
          host: "news.example",
          quote,
        },
      ],
      dropped: 1,
      searches: 3,
    })
  })
  it("is null when the run fails or its reply does not read", async () => {
    expect(await researchOnWeb({ ...input, run: fakeRun(null).run })).toBeNull()
    expect(await researchOnWeb({ ...input, run: fakeRun("no json here").run })).toBeNull()
  })
})
