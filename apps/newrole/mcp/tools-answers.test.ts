import { beforeEach, describe, expect, it, vi } from "vitest"
import { z } from "zod"
import { composeDrafts } from "src/server/answers/compose"
import { saveAnswer, searchAnswers } from "src/server/answers/service"
import { registerAnswerTools } from "./tools-answers"

vi.mock("src/server/answers/service", () => ({
  saveAnswer: vi.fn(),
  searchAnswers: vi.fn(),
}))
vi.mock("src/server/answers/compose", () => ({ composeDrafts: vi.fn() }))
vi.mock("./user", () => ({
  currentUser: vi.fn(async () => ({ id: 7, email: "a@b.c", name: null, how: "test" })),
  NoUserError: class NoUserError extends Error {},
}))
// Only the three helpers are used; the real module pulls in the whole job search.
vi.mock("./tools", () => ({
  reply: (text: string, structuredContent?: object) => ({
    content: [{ type: "text", text }],
    structuredContent,
  }),
  failure: (text: string) => ({ content: [{ type: "text", text }], isError: true }),
  guard: (handler: (args: unknown) => Promise<unknown>) => async (args: unknown) => {
    try {
      return await handler(args)
    } catch (error) {
      return {
        content: [{ type: "text", text: `Failed: ${(error as Error).message}` }],
        isError: true,
      }
    }
  },
}))

type Registered = {
  config: {
    description: string
    inputSchema: z.ZodRawShape
    annotations?: { readOnlyHint?: boolean }
  }
  handler: (args: unknown) => Promise<{
    content: { text: string }[]
    structuredContent?: Record<string, any>
    isError?: boolean
  }>
}

function tools(): Record<string, Registered> {
  const out: Record<string, Registered> = {}
  registerAnswerTools({
    registerTool: (name: string, config: Registered["config"], handler: Registered["handler"]) => {
      out[name] = { config, handler }
    },
  } as never)
  return out
}

const search = searchAnswers as unknown as ReturnType<typeof vi.fn>
const save = saveAnswer as unknown as ReturnType<typeof vi.fn>
const compose = composeDrafts as unknown as ReturnType<typeof vi.fn>

const at = new Date("2026-10-01T10:00:00Z")
const row = {
  id: "a1",
  question: "Why us?",
  questionKey: "why us",
  answer: "Great team.",
  tags: ["motywacja"],
  language: "en",
  company: "Allegro",
  jobTitle: null,
  sourceUrl: null,
  applicationId: null,
  origin: "manual",
  useCount: 3,
  lastUsedAt: null,
  createdAt: at,
  updatedAt: at,
}

const valid = (name: string, args: unknown) =>
  z.object(tools()[name].config.inputSchema).safeParse(args).success

beforeEach(() => {
  search.mockReset()
  save.mockReset()
  compose.mockReset()
})

describe("registration", () => {
  it("registers exactly the three answer tools", () => {
    expect(Object.keys(tools()).sort()).toEqual(["answer_draft", "answer_save", "answers_search"])
    expect(tools().answers_search.config.annotations?.readOnlyHint).toBe(true)
  })

  it("tells Claude to show the draft and save the final wording", () => {
    const { description } = tools().answer_draft.config
    expect(description).toContain("Show every draft to the person")
    expect(description).toContain("answer_save")
  })
})

describe("input validation", () => {
  it("answers_search takes q or question and caps the limit", () => {
    expect(valid("answers_search", {})).toBe(true)
    expect(valid("answers_search", { q: "kotlin", limit: 5 })).toBe(true)
    expect(valid("answers_search", { limit: 500 })).toBe(false)
  })

  it("answer_save needs a question and an answer", () => {
    expect(valid("answer_save", { question: "Q", answer: "A" })).toBe(true)
    expect(valid("answer_save", { question: "Q" })).toBe(false)
    expect(valid("answer_save", { question: "", answer: "A" })).toBe(false)
    expect(valid("answer_save", { question: "Q", answer: "A", language: "de" })).toBe(false)
  })

  it("answer_draft needs at least one question", () => {
    expect(valid("answer_draft", { questions: [{ question: "Why us?" }] })).toBe(true)
    expect(valid("answer_draft", { questions: [] })).toBe(false)
    expect(valid("answer_draft", {})).toBe(false)
  })
})

describe("answers_search", () => {
  it("returns ids, scores and text", async () => {
    search.mockResolvedValue([{ ...row, score: 0.92 }])
    const result = await tools().answers_search.handler({ question: "Why you?" })
    expect(search).toHaveBeenCalledWith(7, {
      q: undefined,
      question: "Why you?",
      tag: undefined,
      limit: 10,
    })
    expect(result.content[0].text).toContain("92%")
    expect(result.content[0].text).toContain("id a1")
    expect(result.structuredContent?.answers[0]).toMatchObject({
      id: "a1",
      score: 0.92,
      answer: "Great team.",
    })
  })

  it("says so when nothing matches", async () => {
    search.mockResolvedValue([])
    const result = await tools().answers_search.handler({ q: "python" })
    expect(result.content[0].text).toContain("answer_draft")
    expect(result.isError).toBeUndefined()
  })
})

describe("answer_save", () => {
  it("creates with origin mcp", async () => {
    save.mockResolvedValue({ answer: row, created: true })
    const result = await tools().answer_save.handler({ question: "Why us?", answer: "Great team." })
    expect(save).toHaveBeenCalledWith({
      question: "Why us?",
      answer: "Great team.",
      userId: 7,
      origin: "mcp",
    })
    expect(result.content[0].text).toContain("Zapisano nową")
    expect(result.structuredContent?.created).toBe(true)
  })

  it("reports an update and a repeated answer", async () => {
    save.mockResolvedValue({ answer: row, created: false })
    expect(
      (await tools().answer_save.handler({ id: "a1", question: "Q", answer: "A" })).content[0].text
    ).toContain("Zaktualizowano")
    expect(
      (await tools().answer_save.handler({ question: "Q", answer: "A" })).content[0].text
    ).toContain("już była")
  })

  it("turns a domain error into a tool error", async () => {
    save.mockRejectedValue(new Error("No answer with id x."))
    const result = await tools().answer_save.handler({ id: "x", question: "Q", answer: "A" })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("No answer with id x.")
  })
})

describe("answer_draft", () => {
  it("passes the job context and returns drafts with the answers they used", async () => {
    compose.mockResolvedValue({
      drafts: {
        q1: { text: "Because of the scale.", basedOn: ["a1"], reader: "llm" },
        q2: { text: "", basedOn: [], reader: "none" },
      },
      sources: { a1: row },
      jobFromIndex: false,
      company: "Allegro",
      jobTitle: "EM",
    })
    const result = await tools().answer_draft.handler({
      questions: [
        { question: "Why us?" },
        { question: "Visa?", options: ["Yes", "No"], maxChars: 10 },
      ],
      company: "Allegro",
      title: "EM",
      jobText: "We use Kotlin.",
      maxChars: 500,
      language: "en",
    })
    expect(compose).toHaveBeenCalledWith({
      userId: 7,
      questions: [
        { key: "q1", question: "Why us?", maxChars: 500, options: undefined },
        { key: "q2", question: "Visa?", maxChars: 10, options: ["Yes", "No"] },
      ],
      context: { company: "Allegro", jobTitle: "EM", jobText: "We use Kotlin.", url: undefined },
      language: "en",
    })
    const [first, second] = result.structuredContent?.drafts
    expect(first).toMatchObject({ text: "Because of the scale.", reader: "llm" })
    expect(first.basedOn[0]).toMatchObject({ id: "a1", question: "Why us?" })
    expect(second).toMatchObject({ text: "", reader: "none" })
    expect(result.content[0].text).toContain("szkic Claude")
    expect(result.content[0].text).toContain("id a1")
    expect(result.content[0].text).toContain("answer_save")
  })
})
