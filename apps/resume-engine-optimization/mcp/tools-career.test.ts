import { beforeEach, describe, expect, it, vi } from "vitest"
import { evaluateOffer, EvaluationError, getEvaluation } from "src/server/evaluation/service"
import { getInterviewPrep } from "src/server/interview/prep"
import { saveStory } from "src/server/interview/stories"
import { InterviewError } from "src/server/interview/types"
import { registerCareerTools } from "./tools-career"

vi.mock("src/server/evaluation/service", () => {
  class EvaluationError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  }
  return { evaluateOffer: vi.fn(), getEvaluation: vi.fn(), EvaluationError }
})
vi.mock("src/server/interview/prep", () => ({
  getInterviewPrep: vi.fn(),
  prepareInterview: vi.fn(),
}))
vi.mock("src/server/interview/stories", () => ({ listStories: vi.fn(), saveStory: vi.fn() }))
vi.mock("./user", () => ({
  currentUser: vi.fn(async () => ({
    id: 7,
    email: "a@b.c",
    name: null,
    how: "test",
    locale: "pl",
  })),
  NoUserError: class NoUserError extends Error {},
}))
vi.mock("./host", () => ({ appLink: (path: string) => `http://127.0.0.1:43123${path}` }))
vi.mock("./tools", () => ({
  reply: (text: string, structuredContent?: object) => ({
    content: [{ type: "text", text }],
    structuredContent,
  }),
  failure: (text: string) => ({ content: [{ type: "text", text }], isError: true }),
  guard: (handler: (args: unknown) => Promise<unknown>) => handler,
}))

type Result = {
  content: { text: string }[]
  structuredContent?: Record<string, any>
  isError?: boolean
}
type Handler = (args: unknown) => Promise<Result>

function tools(): Record<string, Handler> {
  const out: Record<string, Handler> = {}
  registerCareerTools(
    {
      registerTool: (name: string, _config: unknown, handler: Handler) => {
        out[name] = handler
      },
    } as never,
    "pl"
  )
  return out
}

const fn = (f: unknown) => f as ReturnType<typeof vi.fn>
const unknown = { score: null }
const evaluation = {
  jobId: "j1",
  evaluatedAt: new Date("2026-11-16T10:00:00Z"),
  locale: "pl",
  usedModel: true,
  cv: { id: "c1", title: "CV" },
  stale: { cv: false, offer: true, profile: false },
  evaluation: {
    decision: "skip",
    score: 72,
    coverage: 85,
    dimensions: {
      requirements: { score: 80 },
      level: { score: 70 },
      pay: unknown,
      workMode: { score: 100 },
      posting: { score: 40 },
    },
    stops: [{ code: "critical-gap", effect: "skip" }],
    gaps: [
      {
        id: "r1",
        text: "Kubernetes",
        kind: "tool",
        status: "missing",
        level: "critical",
        note: "",
        evidence: "",
      },
    ],
    lead: { emphasize: [], strengths: [] },
    analysis: null,
    report: null,
  },
}

beforeEach(() => vi.clearAllMocks())

describe("offer_evaluate", () => {
  it("returns the stored evaluation in the person's words, with what is unknown and stale", async () => {
    fn(getEvaluation).mockResolvedValue(evaluation)
    const result = await tools().offer_evaluate({ jobId: "j1" })
    const text = result.content[0].text
    expect(evaluateOffer).not.toHaveBeenCalled()
    expect(text).toContain("Lepiej odpuścić")
    expect(text).toContain("72/100")
    expect(text).toContain("Wynagrodzenie: nie wiadomo")
    expect(text).toContain("Luka krytyczna: Kubernetes")
    expect(text).toContain("Model nie podał sposobu na tę lukę.")
    expect(text).toContain("zmieniło się: offer.")
    expect(text).toContain("/offers/j1/evaluation")
    expect(result.structuredContent?.decision).toBe("skip")
  })

  it("makes a new one when asked, and says when the offer is unknown", async () => {
    fn(evaluateOffer).mockRejectedValue(new EvaluationError("job-not-found"))
    const result = await tools().offer_evaluate({ jobId: "nope", refresh: true })
    expect(getEvaluation).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
  })
})

describe("interview_prep", () => {
  it("words the fixed questions and asks from the app's copy", async () => {
    fn(getInterviewPrep).mockResolvedValue({
      jobId: "j1",
      company: "Acme",
      title: "Backend",
      locale: "pl",
      generatedAt: new Date("2026-11-16T10:00:00Z"),
      content: {
        version: 1,
        reader: "rules",
        questions: [
          {
            id: "q1",
            audience: "recruiter",
            text: null,
            basis: { kind: "general", question: "salary" },
            storyId: null,
          },
        ],
        mapping: [],
        risks: null,
        asks: [{ id: "a1", text: null, basis: { kind: "unknown", topic: "salary" } }],
        stories: [],
        basis: { match: "none", matchRound: null, score: null, requirements: 0 },
        missing: ["match"],
      },
    })
    const text = (await tools().interview_prep({ jobId: "j1" })).content[0].text
    expect(text).toContain("Jakie masz oczekiwania finansowe?")
    expect(text).toContain("Jakie są widełki wynagrodzenia na tym stanowisku?")
    expect(text).toContain("nie wiadomo")
  })
})

describe("story_save", () => {
  it("saves with origin mcp and translates a refusal", async () => {
    fn(saveStory).mockRejectedValueOnce(new InterviewError("invalid", "invalid"))
    const result = await tools().story_save({ title: "x" })
    expect(saveStory).toHaveBeenCalledWith(7, { title: "x", origin: "mcp" })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("Historia potrzebuje tytułu")
  })
})
