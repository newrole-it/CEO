import { beforeEach, describe, expect, it, vi } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { buildLetter } from "@newrole/cv-core/letter"

vi.mock("db", () => ({
  default: { cvDocument: { findMany: vi.fn() }, answer: { findMany: vi.fn() } },
}))

import db from "db"
import { isCoverLetterQuestion, pickRecentLetters, recentLetters, sameLetter } from "./letters"

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const SENTENCES: Record<string, string> = {
  A: "Zbudowałem platformę wdrożeń dla czterdziestu zespołów i skróciłem wydania z tygodnia do dnia.",
  B: "Prowadziłem migrację rozliczeń do chmury bez przestoju, razem z zespołem sześciu osób.",
  Acme: "Projektowałem interfejsy programistyczne płatności używane przez setki sklepów internetowych.",
  Beta: "Uczyłem nowe osoby testów kontraktowych i przeglądów kodu w rozproszonym zespole.",
  Gamma: "Utrzymywałem klaster Kubernetes z dyżurami, alertami i planami odtwarzania awarii.",
  Delta: "Odpowiadałem za analitykę produktową, lejki konwersji i eksperymenty na stronie.",
}

/** A letter about one thing, long enough to count as a letter. */
const body = (topic: string) => `${SENTENCES[topic]} `.repeat(3).trim()

const day = (n: number) => new Date(Date.UTC(2026, 9, n))

describe("isCoverLetterQuestion", () => {
  it("knows a letter field the way autofill does, and not someone else's letter", () => {
    expect(isCoverLetterQuestion("Cover Letter")).toBe(true)
    expect(isCoverLetterQuestion("List motywacyjny (opcjonalnie)")).toBe(true)
    expect(isCoverLetterQuestion("Message to the hiring manager")).toBe(true)
    expect(isCoverLetterQuestion("Why do you want to join?")).toBe(false)
    expect(isCoverLetterQuestion("Letter of recommendation")).toBe(false)
  })
})

describe("sameLetter", () => {
  it("is one letter written here and then sent with a greeting and a name", () => {
    const sent = `Dear Hiring Team,\n\n${body("platform")}\n\nKind regards,\n[imię i nazwisko]`
    expect(sameLetter(body("platform"), sent)).toBe(true)
    expect(sameLetter(body("platform"), "Szanowni Państwo, chętnie porozmawiam o pracy.")).toBe(
      false
    )
  })
})

describe("pickRecentLetters", () => {
  it("keeps the three newest, each once, and no notes too short to be a letter", () => {
    const picked = pickRecentLetters([
      { company: "A", title: "SRE", text: body("A"), at: day(1) },
      { company: "B", title: "SRE", text: body("B"), at: day(5) },
      { company: "B", title: "SRE", text: `Dear team,\n\n${body("B")}`, at: day(6) },
      { company: "C", title: "SRE", text: "See my CV.", at: day(7) },
      { company: "D", title: "SRE", text: body("Gamma"), at: day(3) },
      { company: "E", title: "SRE", text: body("Delta"), at: day(4) },
    ])
    expect(picked.map((letter) => letter.company)).toEqual(["B", "E", "D"])
    expect(picked[0].text.startsWith("Dear team")).toBe(true)
  })
})

describe("recentLetters", () => {
  beforeEach(() => {
    mocked(db.cvDocument.findMany).mockReset()
    mocked(db.answer.findMany).mockReset()
  })

  it("reads the letters kept here and the ones sent in forms, not the offer's own", async () => {
    const letter = (company: string, paragraphs: string[]) =>
      buildLetter({ cv: syntheticCv(1), language: "pl", company, jobTitle: "SRE", paragraphs })
    mocked(db.cvDocument.findMany).mockResolvedValue([
      {
        jobId: "job1",
        content: letter("Acme", [body("Acme")]),
        targetCompany: "Acme",
        targetTitle: "SRE",
        updatedAt: day(9),
      },
      {
        jobId: "job2",
        content: letter("Beta", [body("Beta"), "Chętnie porozmawiam."]),
        targetCompany: "Beta",
        targetTitle: "SRE",
        updatedAt: day(2),
      },
    ])
    mocked(db.answer.findMany).mockResolvedValue([
      {
        question: "Cover letter",
        answer: body("Gamma"),
        company: "Gamma",
        jobTitle: "Dev",
        updatedAt: day(8),
      },
      {
        question: "Why us?",
        answer: body("Delta"),
        company: "Delta",
        jobTitle: "Dev",
        updatedAt: day(7),
      },
    ])
    const letters = await recentLetters(1, { exceptJobId: "job1" })
    expect(letters.map((item) => item.company)).toEqual(["Gamma", "Beta"])
    expect(letters[1]).toEqual({
      company: "Beta",
      title: "SRE",
      text: `${body("Beta")}\n\nChętnie porozmawiam.`,
    })
    expect(mocked(db.cvDocument.findMany).mock.calls[0][0].where).toEqual({
      userId: 1,
      docType: "LETTER",
      kind: "EDITABLE",
    })
  })
})
