import { describe, expect, it } from "vitest"
import type { MatchReport, OfferAnalysis } from "./match"
import { cleanStory } from "./stories"
import {
  audienceOf,
  buildInterviewPrep,
  InterviewPrepContent,
  PrepReply,
  ruleFit,
  unknownTopics,
  type PrepInput,
  type PrepStory,
} from "./stories-prep"

const OFFER = `Senior Backend Engineer at Globex. We work in a fast-paced environment.
You have 5 years of Kotlin, you know Kafka and you led a team. AWS is a plus.
Competitive salary. Hybrid from Warsaw.`

const analysis: OfferAnalysis = {
  role: "Backend engineer for the billing platform.",
  seniority: "Senior",
  requirements: [
    {
      id: "r1",
      text: "5 years of Kotlin",
      importance: "required",
      kind: "tool",
      keyword: "Kotlin",
    },
    {
      id: "r2",
      text: "Experience with Kafka",
      importance: "required",
      kind: "tool",
      keyword: "Kafka",
    },
    { id: "r3", text: "Led a team", importance: "required", kind: "experience" },
    { id: "r4", text: "AWS", importance: "preferred", kind: "tool", keyword: "AWS" },
    { id: "r5", text: "Clear communication", importance: "soft", kind: "soft" },
  ],
  keywords: [],
  responsibilities: [],
  redFlags: [{ quote: "fast-paced environment", why: "Often means overtime." }],
  signals: [],
}

const requirement = (id: string, status: "met" | "partial" | "missing", note = "") => {
  const item = analysis.requirements.find((entry) => entry.id === id)!
  return {
    ...item,
    status,
    evidence: status === "missing" ? "" : "Led a team of 5",
    gap: status === "met" ? null : ("major" as const),
    note,
  }
}

const report: MatchReport = {
  score: 60,
  band: "good",
  groups: {
    required: { met: 1, partial: 1, total: 3, percent: 50 },
    preferred: { met: 0, partial: 0, total: 1, percent: 0 },
    soft: { met: 0, partial: 0, total: 1, percent: 0 },
  },
  requirements: [
    requirement("r1", "met"),
    requirement("r2", "missing", "Bring up the queue work you did with RabbitMQ."),
    requirement("r3", "partial"),
    requirement("r4", "missing"),
    requirement("r5", "missing"),
  ],
  strengths: [],
  emphasize: [],
  talkingPoints: [],
  critical: 0,
}

const story = (id: string, fields: Parameters<typeof cleanStory>[0]): PrepStory => ({
  id,
  ...cleanStory(fields),
})

const billing = story("s1", {
  title: "Moving billing out of the monolith",
  situation: "Billing lived in a monolith.",
  action: "I moved billing to services written in Kotlin.",
  result: "The move had no downtime and cut deploys from 40 to 6 minutes.",
  themes: ["technical decision"],
})
const team = story("s2", {
  title: "Taking over a team",
  situation: "A team lost its lead.",
  action: "I ran planning and one-to-ones.",
  themes: ["leadership", "led a team"],
})

const EVIDENCE = "Acme · Senior Backend Engineer. Kotlin, RabbitMQ. Led a team of 5. 40 minutes."

const input = (over: Partial<PrepInput> = {}): PrepInput => ({
  analysis,
  report,
  match: { kind: "round", round: 2 },
  stories: [billing, team],
  offerText: OFFER,
  facts: { hasSalary: false, hasWorkMode: false, hasContract: false },
  evidence: EVIDENCE,
  hasCv: true,
  reply: null,
  hasModel: false,
  ...over,
})

describe("rules alone", () => {
  const prep = buildInterviewPrep(input())

  it("is a valid stored preparation made without a model", () => {
    expect(InterviewPrepContent.safeParse(prep).success).toBe(true)
    expect(prep.reader).toBe("rules")
    expect(prep.missing).toEqual(["model"])
    expect(prep.basis).toEqual({ match: "round", matchRound: 2, score: 60, requirements: 5 })
  })

  it("ties every question to a requirement or marks it general", () => {
    for (const question of prep.questions) {
      expect(question.text).toBeNull()
      if (question.basis.kind === "requirement")
        expect(analysis.requirements.map((item) => item.id)).toContain(question.basis.requirementId)
    }
    const byAudience = (audience: string) =>
      prep.questions
        .filter((question) => question.audience === audience)
        .map((question) =>
          question.basis.kind === "requirement"
            ? question.basis.requirementId
            : question.basis.question
        )
    expect(byAudience("peer").slice(0, 3)).toEqual(["r1", "r2", "r4"])
    expect(byAudience("manager").slice(0, 2)).toEqual(["r3", "r5"])
    expect(byAudience("recruiter")[0]).toBe("walk-through")
  })

  it("maps stories to requirements by words", () => {
    const fit = Object.fromEntries(prep.mapping.map((item) => [item.requirementId, item]))
    expect(fit.r1).toMatchObject({ storyId: "s1", fit: "strong", by: "rules" })
    expect(fit.r2).toMatchObject({ storyId: null, fit: "none" })
    // only in the themes: the story touches it, nothing shows the person did it
    expect(fit.r3).toMatchObject({ storyId: "s2", fit: "partial" })
    expect(fit.r4).toMatchObject({ storyId: null, fit: "none" })
  })

  it("names a story's numbers the person's data does not have", () => {
    expect(prep.mapping[0].unbacked).toEqual(["6"])
  })

  it("lists the unmet required items with the match's own note", () => {
    expect(prep.risks).toEqual([
      {
        requirementId: "r2",
        requirement: "Experience with Kafka",
        status: "missing",
        gap: "major",
        evidence: "",
        line: "Bring up the queue work you did with RabbitMQ.",
        by: "match",
      },
      {
        requirementId: "r3",
        requirement: "Led a team",
        status: "partial",
        gap: "major",
        evidence: "Led a team of 5",
        line: "",
        by: "none",
      },
    ])
  })

  it("draws the questions to ask from red flags and from what the offer leaves open", () => {
    expect(prep.asks.map((ask) => ask.id)).toEqual([
      "flag:1",
      "unknown:salary",
      "unknown:contract",
      "general:process",
      "general:success",
      "general:team",
    ])
  })
})

describe("what is missing", () => {
  it("says the risks are unknown without a match, never none", () => {
    const prep = buildInterviewPrep(input({ report: null, match: { kind: "none", round: null } }))
    expect(prep.risks).toBeNull()
    expect(prep.missing).toContain("match")
    expect(prep.basis.match).toBe("none")
  })

  it("still gives the general questions with nothing but the offer's name", () => {
    const prep = buildInterviewPrep(
      input({ analysis: null, report: null, stories: [], offerText: "", hasCv: false })
    )
    expect(prep.missing).toEqual(["offer-text", "requirements", "match", "stories", "cv", "model"])
    expect(prep.mapping).toEqual([])
    expect(prep.questions.every((question) => question.basis.kind === "general")).toBe(true)
    expect(prep.asks.map((ask) => ask.basis.kind)).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "general",
      "general",
      "general",
    ])
  })
})

describe("the model's reply, checked", () => {
  const reply = PrepReply.parse({
    questions: [
      { requirementId: "r1", audience: "manager", text: "How have you used Kotlin in production?" },
      { requirementId: "r2", text: "At Globex we always ask about Kafka Streams and Flink." },
      { requirementId: "r9", text: "A question about nothing in the offer?" },
    ],
    mapping: [
      {
        requirementId: "r3",
        storyId: "s2",
        fit: "strong",
        evidence: "I ran planning and one-to-ones",
      },
      { requirementId: "r2", storyId: "s1", fit: "strong", evidence: "I built Kafka pipelines" },
      { requirementId: "r4", storyId: "s1", fit: "partial" },
      {
        requirementId: "r5",
        storyId: "nope",
        fit: "strong",
        evidence: "Billing lived in a monolith",
      },
    ],
    risks: [
      { requirementId: "r2", line: "I have not used Kafka; I ran queues on RabbitMQ." },
      { requirementId: "r3", line: "I led 12 engineers across 3 teams." },
    ],
    asks: [
      { text: "What does a typical week look like?", quote: "fast-paced environment" },
      { text: "How many days in the office?", quote: "Hybrid from Warsaw" },
      { text: "What is the on-call rota?", quote: "on-call every second week" },
    ],
  })
  const prep = buildInterviewPrep(input({ reply, hasModel: true }))
  const fit = Object.fromEntries(prep.mapping.map((item) => [item.requirementId, item]))

  it("keeps a question for a known requirement and its audience", () => {
    const question = prep.questions.find((item) => item.id === "manager:r1")
    expect(question?.text).toBe("How have you used Kotlin in production?")
    expect(question?.basis).toMatchObject({ kind: "requirement", requirementId: "r1" })
  })

  it("drops a question naming what neither the offer nor the person's data names", () => {
    expect(prep.questions.find((item) => item.id === "peer:r2")?.text).toBeNull()
    expect(prep.questions.some((item) => item.id.endsWith(":r9"))).toBe(false)
  })

  it("counts a story only when its fragment is found in it", () => {
    expect(fit.r3).toMatchObject({
      storyId: "s2",
      fit: "strong",
      by: "model",
      evidence: "I ran planning and one-to-ones",
    })
    // a fragment the story does not have: strong becomes partial, with nothing to quote
    expect(fit.r2).toMatchObject({ storyId: "s1", fit: "partial", evidence: "" })
    // partial with no fragment and an unknown story: not at all
    expect(fit.r4.fit).toBe("none")
    expect(fit.r5.storyId).toBeNull()
  })

  it("keeps an honest line and drops one with numbers the data does not have", () => {
    expect(prep.risks?.[0]).toMatchObject({
      line: "I have not used Kafka; I ran queues on RabbitMQ.",
      by: "model",
    })
    expect(prep.risks?.[1]).toMatchObject({ line: "", by: "none" })
  })

  it("keeps a question to ask only when its fragment is in the offer", () => {
    expect(prep.asks.slice(0, 2)).toEqual([
      {
        id: "flag:1",
        text: "What does a typical week look like?",
        basis: { kind: "red-flag", quote: "fast-paced environment", why: "Often means overtime." },
      },
      {
        id: "offer:1",
        text: "How many days in the office?",
        basis: { kind: "offer", quote: "Hybrid from Warsaw" },
      },
    ])
    expect(prep.asks.some((ask) => ask.text === "What is the on-call rota?")).toBe(false)
    expect(prep.reader).toBe("llm")
  })
})

describe("Polish wording", () => {
  it("does not read a capitalised form of address as an unknown name", () => {
    const reply = PrepReply.parse({
      questions: [{ requirementId: "r1", text: "Jak wyglądała Twoja praca z Kotlinem?" }],
      risks: [
        { requirementId: "r2", line: "Nie pracowałem z Kafką, kolejki prowadziłem na RabbitMQ." },
      ],
    })
    const prep = buildInterviewPrep(input({ reply, hasModel: true }))
    expect(prep.questions.find((item) => item.id === "peer:r1")?.text).toBe(
      "Jak wyglądała Twoja praca z Kotlinem?"
    )
    expect(prep.risks?.[0].by).toBe("model")
  })
})

describe("helpers", () => {
  it("reads what the offer leaves open from its record and its text", () => {
    const none = { hasSalary: false, hasWorkMode: false, hasContract: false }
    expect(unknownTopics("", none)).toEqual(["salary", "work-mode", "contract"])
    expect(unknownTopics("18 000 – 24 000 PLN, B2B, zdalnie", none)).toEqual([])
    expect(unknownTopics("", { hasSalary: true, hasWorkMode: true, hasContract: true })).toEqual([])
  })

  it("picks who asks about a kind of requirement", () => {
    expect(audienceOf("certification")).toBe("recruiter")
    expect(audienceOf("soft")).toBe("manager")
    expect(audienceOf("tool")).toBe("peer")
  })

  it("matches a Polish requirement by stem", () => {
    const polish = cleanStory({
      title: "Przejęcie zespołu",
      action: "Zarządzałem zespołem sześciu osób.",
    })
    expect(ruleFit({ text: "zarządzanie zespołem" }, polish)).toBe("strong")
    expect(ruleFit({ text: "Terraform", keyword: "Terraform" }, polish)).toBe("none")
  })
})
