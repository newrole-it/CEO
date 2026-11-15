import { describe, expect, it } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { StepUpdate } from "@newrole/cv-core/progress"
import { cvPlainText } from "@newrole/cv-core/text"
import type { LlmClient } from "@newrole/llm/common"
import { readOfferFit } from "./evaluate"

const offer = {
  company: "Acme",
  title: "Platform Engineer",
  text: "Wymagamy Kubernetes. Mile widziany Terraform.",
}

const analysisReply = {
  role: "Buduje platformę.",
  seniority: "",
  requirements: [
    { text: "Kubernetes", importance: "required", kind: "tool", keyword: "Kubernetes" },
    { text: "Terraform", importance: "preferred", kind: "tool" },
  ],
  keywords: [],
  responsibilities: [],
  redFlags: [],
  signals: [],
}

const matchReply = {
  requirements: [
    { id: "r1", status: "met", evidence: "Node.js, PostgreSQL, Kubernetes, API" },
    { id: "r2", status: "missing", gap: "minor" },
  ],
  strengths: [],
  emphasize: [],
  talkingPoints: [],
}

/** A model that answers each step by its purpose; a missing reply is no answer, an Error throws. */
function fakeLlm(replies: Record<string, unknown>) {
  const asked: { purpose: string; user: string }[] = []
  const llm: LlmClient = {
    model: "fake",
    async completeJson(args) {
      asked.push({ purpose: args.purpose, user: args.user })
      const reply = replies[args.purpose]
      if (reply instanceof Error) throw reply
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  } as LlmClient
  return { llm, asked }
}

function run(replies: Record<string, unknown>) {
  const cv = syntheticCv(1)
  const steps: StepUpdate[] = []
  const { llm, asked } = fakeLlm(replies)
  const fit = readOfferFit({
    llm,
    offer,
    cv,
    context: "",
    evidence: cvPlainText(cv),
    locale: "pl",
    onStep: (update) => steps.push(update),
  })
  return { fit, asked, states: () => steps.map((update) => `${update.step}:${update.state}`) }
}

describe("readOfferFit", () => {
  it("reads the offer before the CV is shown, then checks the CV against it", async () => {
    const { fit, asked, states } = run({ "offer-analysis": analysisReply, "cv-match": matchReply })
    const result = await fit
    expect(asked.map((call) => call.purpose)).toEqual(["offer-analysis", "cv-match"])
    // the first pass sees the offer alone: nothing of the person's CV
    expect(asked[0].user).not.toContain("Przykładowa Firma 1")
    expect(asked[1].user).toContain("Przykładowa Firma 1")
    expect(result.failed).toBeNull()
    expect(result.report?.score).toBe(70)
    expect(states()).toEqual(["offer:running", "offer:done", "match:running", "match:done"])
  })

  it("ends at the step that gives nothing, and says which", async () => {
    const none = run({})
    expect(await none.fit).toEqual({ analysis: null, report: null, failed: "offer" })
    expect(none.states()).toEqual(["offer:running", "offer:failed", "match:skipped"])

    const half = run({ "offer-analysis": analysisReply, "cv-match": new Error("timeout") })
    const result = await half.fit
    expect(result.failed).toBe("match")
    expect(result.analysis?.requirements).toHaveLength(2)
    expect(result.report).toBeNull()
    expect(half.states()).toEqual(["offer:running", "offer:done", "match:running", "match:failed"])
  })
})
