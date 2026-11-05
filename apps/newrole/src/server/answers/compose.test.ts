import { beforeEach, describe, expect, it, vi } from "vitest"
import db from "db"
import { findJobByUrl } from "src/server/applications/service"
import { composeDrafts, withIndexedJob } from "./compose"
import { draftAnswers } from "./service"

vi.mock("db", () => ({
  default: {
    job: { findUnique: vi.fn(async () => ({ descriptionText: "We build payments in Kotlin." })) },
    answer: { findMany: vi.fn(async () => []) },
  },
}))
vi.mock("src/server/applications/service", () => ({ findJobByUrl: vi.fn() }))
vi.mock("./service", () => ({
  draftAnswers: vi.fn(),
  toAnswerView: (row: unknown) => row,
}))

const lookup = findJobByUrl as unknown as ReturnType<typeof vi.fn>
const draft = draftAnswers as unknown as ReturnType<typeof vi.fn>
const answers = db.answer.findMany as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  lookup.mockReset()
  draft.mockReset()
  answers.mockClear()
})

describe("withIndexedJob", () => {
  it("fills the gaps from the indexed offer and keeps what was given", async () => {
    lookup.mockResolvedValue({ id: "j1", title: "Backend Engineer", company: { name: "Allegro" } })
    const { context, fromIndex } = await withIndexedJob({
      url: "https://x.io/1",
      jobTitle: "My title",
    })
    expect(context).toMatchObject({
      company: "Allegro",
      jobTitle: "My title",
      jobText: "We build payments in Kotlin.",
    })
    expect(fromIndex).toBe(true)
  })

  it("leaves the context alone without a URL or without a match", async () => {
    expect(await withIndexedJob({ company: "A" })).toEqual({
      context: { company: "A" },
      fromIndex: false,
    })
    expect(lookup).not.toHaveBeenCalled()
    lookup.mockResolvedValue(null)
    expect((await withIndexedJob({ url: "https://x.io/2" })).fromIndex).toBe(false)
  })

  it("survives a failed lookup", async () => {
    lookup.mockRejectedValue(new Error("db down"))
    expect((await withIndexedJob({ url: "https://x.io/3" })).fromIndex).toBe(false)
  })
})

describe("composeDrafts", () => {
  it("returns the answers the drafts used, scoped to the person", async () => {
    draft.mockResolvedValue({ q: { text: "Draft", basedOn: ["a1"], reader: "llm" } })
    answers.mockResolvedValue([{ id: "a1", question: "Why us?" }])
    const result = await composeDrafts({ userId: 3, questions: [{ key: "q", question: "Why?" }] })
    expect(answers).toHaveBeenCalledWith({ where: { userId: 3, id: { in: ["a1"] } } })
    expect(result.sources.a1).toMatchObject({ question: "Why us?" })
    expect(result.drafts.q.text).toBe("Draft")
  })

  it("skips the lookup when nothing was used", async () => {
    draft.mockResolvedValue({ q: { text: "", basedOn: [], reader: "none" } })
    const result = await composeDrafts({ userId: 3, questions: [{ key: "q", question: "Why?" }] })
    expect(answers).not.toHaveBeenCalled()
    expect(result.sources).toEqual({})
  })
})
