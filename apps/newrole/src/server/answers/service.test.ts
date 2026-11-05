import { beforeEach, describe, expect, it, vi } from "vitest"
import db from "db"
import { createWritingClient } from "src/server/llm/writing"
import {
  answerBankStats,
  deleteAnswer,
  draftAnswers,
  questionKey,
  recordFormAnswers,
  saveAnswer,
  searchAnswers,
} from "./service"

/** A small in-memory stand-in for the Prisma tables the service touches. */
vi.mock("db", () => {
  type Row = Record<string, any>
  const rows: Row[] = []
  let next = 1
  const matches = (row: Row, where: Row) =>
    Object.entries(where).every(([key, value]) => row[key] === value)
  const newestFirst = (list: Row[]) =>
    [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
  const answer = {
    findMany: async ({ where }: { where: Row }) =>
      newestFirst(rows.filter((row) => matches(row, where))),
    findFirst: async ({ where }: { where: Row }) => rows.find((row) => matches(row, where)) ?? null,
    create: async ({ data }: { data: Row }) => {
      const at = new Date(Date.UTC(2026, 9, 1, 0, 0, next))
      const row = { id: `a${next}`, createdAt: at, updatedAt: at, ...data }
      next += 1
      rows.push(row)
      return row
    },
    update: async ({ where, data }: { where: { id: string }; data: Row }) => {
      const row = rows.find((item) => item.id === where.id)!
      for (const [key, value] of Object.entries(data)) {
        row[key] =
          value && typeof value === "object" && "increment" in value
            ? row[key] + value.increment
            : value
      }
      return row
    },
    deleteMany: async ({ where }: { where: Row }) => {
      const before = rows.length
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], where)) rows.splice(index, 1)
      }
      return { count: before - rows.length }
    },
  }
  const fake = {
    answer,
    application: {
      findFirst: async ({ where }: { where: Row }) =>
        where.id === "app-1" && where.userId === 1 ? { id: "app-1" } : null,
    },
    user: {
      findUnique: async () => ({
        name: "Rafał Testowy",
        email: "rafal@example.com",
        applicant: { phone: "+48 600 100 200" },
      }),
    },
    __rows: rows,
  }
  return { default: fake }
})

vi.mock("src/server/llm/writing", () => ({ createWritingClient: vi.fn() }))
vi.mock("src/server/profile/context", () => ({
  candidateContext: vi.fn(async () => "Skills: Kotlin, Postgres"),
}))

const rows = (db as unknown as { __rows: Record<string, any>[] }).__rows
const writing = createWritingClient as unknown as ReturnType<typeof vi.fn>

function modelReplying(answers: Record<string, { text: string; basedOn?: string[] }> | null) {
  const completeJson = vi.fn(async () =>
    answers ? { data: { answers }, tokenInput: 0, tokenOutput: 0, cached: false } : null
  )
  writing.mockReturnValue({ model: "test", completeJson, completeText: vi.fn() })
  return completeJson
}

beforeEach(() => {
  rows.length = 0
  writing.mockReset()
})

const base = { userId: 1, origin: "manual" as const }

describe("saveAnswer", () => {
  it("creates a row with key, detected language and clean tags", async () => {
    const { answer, created } = await saveAnswer({
      ...base,
      question: "Dlaczego chcesz u nas pracować?",
      answer: "Bo lubię trudne problemy.",
      tags: [" motywacja ", "Motywacja"],
    })
    expect(created).toBe(true)
    expect(answer.questionKey).toBe(questionKey("Dlaczego chcesz u nas pracować?"))
    expect(answer.language).toBe("pl")
    expect(answer.tags).toEqual(["motywacja"])
    expect(answer.useCount).toBe(1)
  })

  it("counts an identical answer as a use instead of a new row", async () => {
    await saveAnswer({ ...base, question: "Why us?", answer: "Great team." })
    const again = await saveAnswer({ ...base, question: "why us", answer: "  great   TEAM! " })
    expect(again.created).toBe(false)
    expect(again.answer.useCount).toBe(2)
    expect(again.answer.lastUsedAt).toBeInstanceOf(Date)
    expect(rows).toHaveLength(1)
  })

  it("stores a different answer to the same question as a variant", async () => {
    await saveAnswer({ ...base, question: "Why us?", answer: "Great team.", company: "Allegro" })
    const other = await saveAnswer({
      ...base,
      question: "Why us?",
      answer: "Great product.",
      company: "Google",
    })
    expect(other.created).toBe(true)
    expect(rows).toHaveLength(2)
    expect(rows[0].questionKey).toBe(rows[1].questionKey)
  })

  it("updates by id, keeps the origin, and refuses someone else's row", async () => {
    const { answer } = await saveAnswer({
      ...base,
      origin: "draft",
      question: "Why us?",
      answer: "One.",
    })
    const edited = await saveAnswer({
      ...base,
      id: answer.id,
      question: "Why you?",
      answer: "Two.",
    })
    expect(edited.created).toBe(false)
    expect(edited.answer).toMatchObject({ answer: "Two.", questionKey: "why you", origin: "draft" })
    await expect(
      saveAnswer({ userId: 2, origin: "manual", id: answer.id, question: "q", answer: "a" })
    ).rejects.toThrow("No answer")
  })

  it("rejects an empty question or answer", async () => {
    await expect(saveAnswer({ ...base, question: "  ", answer: "a" })).rejects.toThrow("required")
    await expect(saveAnswer({ ...base, question: "q", answer: "\n" })).rejects.toThrow("required")
  })

  it("links only the person's own application", async () => {
    const own = await saveAnswer({
      ...base,
      question: "A?",
      answer: "Yes indeed",
      applicationId: "app-1",
    })
    const other = await saveAnswer({
      ...base,
      question: "B?",
      answer: "Yes indeed",
      applicationId: "app-2",
    })
    expect(own.answer.applicationId).toBe("app-1")
    expect(other.answer.applicationId).toBeNull()
  })
})

describe("searchAnswers", () => {
  beforeEach(async () => {
    await saveAnswer({
      ...base,
      question: "Why do you want to work with us?",
      answer: "Kotlin at scale.",
      tags: ["motywacja"],
    })
    await saveAnswer({
      ...base,
      question: "What is your notice period?",
      answer: "One month.",
      company: "Allegro",
    })
  })

  it("returns newest first without a query", async () => {
    const found = await searchAnswers(1, {})
    expect(found.map((row) => row.question)).toEqual([
      "What is your notice period?",
      "Why do you want to work with us?",
    ])
    expect(found[0].score).toBeUndefined()
  })

  it("filters by text across fields and by tag", async () => {
    expect((await searchAnswers(1, { q: "kotlin" })).map((row) => row.answer)).toEqual([
      "Kotlin at scale.",
    ])
    expect((await searchAnswers(1, { q: "allegro" })).map((row) => row.answer)).toEqual([
      "One month.",
    ])
    expect(await searchAnswers(1, { q: "python" })).toEqual([])
    expect((await searchAnswers(1, { tag: "MOTYWACJA" })).map((row) => row.answer)).toEqual([
      "Kotlin at scale.",
    ])
  })

  it("ranks by similarity to a question and returns scores", async () => {
    const found = await searchAnswers(1, { question: "Dlaczego chcesz u nas pracować?" })
    expect(found).toHaveLength(1)
    expect(found[0].answer).toBe("Kotlin at scale.")
    expect(found[0].score).toBeGreaterThan(0.6)
  })

  it("only sees the person's own rows and respects the limit", async () => {
    expect(await searchAnswers(2, {})).toEqual([])
    expect(await searchAnswers(1, { limit: 1 })).toHaveLength(1)
  })
})

describe("recordFormAnswers", () => {
  it("stores open answers, skips personal data and counts reuse", async () => {
    await saveAnswer({ ...base, question: "Why us?", answer: "Great team." })
    const result = await recordFormAnswers({
      userId: 1,
      applicationId: "app-1",
      company: "Allegro",
      jobTitle: "EM",
      sourceUrl: "https://boards.greenhouse.io/allegro/jobs/1",
      pairs: [
        { question: "First name", answer: "Rafał" },
        { question: "Email", answer: "rafal@example.com" },
        { question: "How did you find us?", answer: "Rafał Testowy" },
        { question: "Why us?", answer: "Great team." },
        { question: "Expected salary", answer: "30 000 PLN" },
        { question: "Describe a project you led", answer: "I led the checkout rewrite." },
        { question: "I agree to the privacy policy", answer: "Yes" },
        { question: "Gender", answer: "Male" },
      ],
    })
    expect(result).toEqual({ saved: 2, reused: 1 })
    expect(rows).toHaveLength(3)
    const project = rows.find((row) => row.question === "Describe a project you led")!
    expect(project).toMatchObject({
      origin: "extension",
      applicationId: "app-1",
      company: "Allegro",
      jobTitle: "EM",
    })
    expect(JSON.stringify(rows)).not.toContain("rafal@example.com")
    expect(rows.find((row) => row.question === "Why us?")!.useCount).toBe(2)
  })
})

describe("answerBankStats", () => {
  it("counts answers, questions, variants and tags", async () => {
    await saveAnswer({ ...base, question: "Why us?", answer: "Team.", tags: ["motywacja"] })
    await saveAnswer({
      ...base,
      question: "why us",
      answer: "Product.",
      tags: ["Motywacja", "firma"],
    })
    await saveAnswer({ ...base, question: "Notice period?", answer: "One month." })
    const stats = await answerBankStats(1)
    expect(stats.total).toBe(3)
    expect(stats.questions).toBe(2)
    expect(stats.variants[questionKey("Why us?")]).toBe(2)
    expect(stats.tags).toEqual([
      { tag: "Motywacja", count: 2 },
      { tag: "firma", count: 1 },
    ])
  })
})

describe("deleteAnswer", () => {
  it("deletes only the person's own row", async () => {
    const { answer } = await saveAnswer({ ...base, question: "Why us?", answer: "Team." })
    await expect(deleteAnswer(2, answer.id)).rejects.toThrow("No answer")
    expect(rows).toHaveLength(1)
    await deleteAnswer(1, answer.id)
    expect(rows).toHaveLength(0)
  })
})

describe("draftAnswers", () => {
  it("reuses a stored answer without calling the model", async () => {
    const { answer } = await saveAnswer({ ...base, question: "Why us?", answer: "Great team." })
    const completeJson = modelReplying({})
    const result = await draftAnswers({
      userId: 1,
      questions: [{ key: "f1", question: "Why us?" }],
    })
    expect(result.f1).toEqual({ text: "Great team.", basedOn: [answer.id], reader: "reuse" })
    expect(completeJson).not.toHaveBeenCalled()
  })

  it("sends everything else to the model in one call", async () => {
    const { answer } = await saveAnswer({
      ...base,
      question: "Why do you want to work with us?",
      answer: "Kotlin at scale.",
    })
    const completeJson = modelReplying({
      q1: { text: "I want to build Kotlin systems at Allegro.", basedOn: [answer.id, "invented"] },
      q2: { text: "I led a checkout rewrite." },
    })
    const result = await draftAnswers({
      userId: 1,
      questions: [
        { key: "why", question: "Why are you interested in joining Allegro?" },
        { key: "project", question: "Describe a project you led" },
      ],
      context: { company: "Allegro", jobTitle: "EM", jobText: "We use Kotlin." },
    })
    expect(completeJson).toHaveBeenCalledTimes(1)
    const call = (completeJson.mock.calls as unknown as [Record<string, any>][])[0][0]
    expect(call.purpose).toBe("answer-draft")
    expect(call.userId).toBe(1)
    expect(call.user).toContain("Skills: Kotlin, Postgres")
    expect(call.user).toContain("We use Kotlin.")
    expect(call.user).toContain(`id: ${answer.id}`)
    expect(result.why).toEqual({
      text: "I want to build Kotlin systems at Allegro.",
      basedOn: [answer.id],
      reader: "llm",
    })
    expect(result.project).toEqual({
      text: "I led a checkout rewrite.",
      basedOn: [],
      reader: "llm",
    })
  })

  it("uses form-fill for select questions and returns the option verbatim", async () => {
    const completeJson = modelReplying({ q1: { text: "yes" } })
    const result = await draftAnswers({
      userId: 1,
      questions: [
        { key: "visa", question: "Are you eligible to work in the EU?", options: ["Yes", "No"] },
      ],
    })
    expect((completeJson.mock.calls as unknown as [Record<string, any>][])[0][0].purpose).toBe(
      "form-fill"
    )
    expect(result.visa).toEqual({ text: "Yes", basedOn: [], reader: "llm" })
  })

  it("honours the language override and the character limit", async () => {
    const completeJson = modelReplying({ q1: { text: "One two three four five six seven" } })
    const result = await draftAnswers({
      userId: 1,
      language: "pl",
      questions: [{ key: "a", question: "Tell us about yourself", maxChars: 12 }],
    })
    expect((completeJson.mock.calls as unknown as [Record<string, any>][])[0][0].user).toContain(
      "language: pl"
    )
    expect(result.a.text.length).toBeLessThanOrEqual(12)
  })

  it("returns reader none when no model is available", async () => {
    writing.mockReturnValue(null)
    const result = await draftAnswers({ userId: 1, questions: [{ key: "a", question: "Why us?" }] })
    expect(result.a).toEqual({ text: "", basedOn: [], reader: "none" })
  })

  it("returns reader none when the model fails or skips a question", async () => {
    modelReplying(null)
    expect(
      (await draftAnswers({ userId: 1, questions: [{ key: "a", question: "Why us?" }] })).a.reader
    ).toBe("none")
    writing.mockReturnValue({
      model: "test",
      completeJson: vi.fn(async () => {
        throw new Error("timeout")
      }),
    })
    expect(
      (await draftAnswers({ userId: 1, questions: [{ key: "a", question: "Why us?" }] })).a.reader
    ).toBe("none")
    modelReplying({ q9: { text: "wrong id" } })
    expect(
      (await draftAnswers({ userId: 1, questions: [{ key: "a", question: "Why us?" }] })).a.reader
    ).toBe("none")
  })

  it("returns an empty result for no usable questions", async () => {
    expect(await draftAnswers({ userId: 1, questions: [{ key: "a", question: "  " }] })).toEqual({})
  })
})
