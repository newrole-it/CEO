import { beforeEach, describe, expect, it, vi } from "vitest"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { buildLetter } from "@newrole/cv-core/letter"
import { parseCvContent, type CvContent } from "@newrole/cv-core/schema"

// vitest 0.25 has no vi.hoisted: each mocked module owns its own spies.
vi.mock("src/server/applications/service", () => ({ findJobByUrl: vi.fn() }))
vi.mock("src/server/auth/magic-link", () => ({ assertOfferReadLimit: vi.fn() }))
vi.mock("src/server/cv/letters", () => ({ recentLetters: vi.fn() }))
vi.mock("src/server/cv/service", async () => {
  const actual = (await vi.importActual("src/server/cv/service")) as Record<string, unknown>
  return { CvError: actual.CvError, contentPdf: vi.fn(), cvPdf: vi.fn() }
})
vi.mock("src/server/cv/tailor", () => ({
  generateLetterForJob: vi.fn(),
  generalLetterForJob: vi.fn(),
  letterForJob: vi.fn(),
  writeLetterForPage: vi.fn(),
}))
vi.mock("src/server/offers/service", () => ({ addOfferByLink: vi.fn() }))

import { findJobByUrl } from "src/server/applications/service"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { recentLetters } from "src/server/cv/letters"
import { contentPdf, cvPdf, CvError } from "src/server/cv/service"
import {
  generateLetterForJob,
  generalLetterForJob,
  letterForJob,
  writeLetterForPage,
} from "src/server/cv/tailor"
import { addOfferByLink } from "src/server/offers/service"
import {
  clearFormLetters,
  formLetterPdf,
  formLetterStatus,
  letterText,
  paragraphBudget,
  startFormLetter,
  writeFormLetter,
  type LetterInput,
  type WrittenLetter,
} from "./letter"

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

function letter(paragraphs: string[], language: "pl" | "en" = "pl"): CvContent {
  const cv = syntheticCv(1)
  const content = parseCvContent(
    buildLetter({ cv, language, company: "Acme", jobTitle: "Staff Engineer", paragraphs })
  )
  if (!content) throw new Error("no letter")
  return content
}

const page = {
  url: "https://jobs.lever.co/acme/uuid/apply",
  title: "Acme - Staff Engineer",
  text: "Szukamy osoby, która zna Kubernetes.",
}

const input = (extra: Partial<LetterInput> = {}): LetterInput => ({
  userId: 1,
  page,
  job: Promise.resolve(null),
  ...extra,
})

const past = [
  { company: "Beta", title: "SRE", text: "List do Bety." },
  { company: "Gamma", title: "SRE", text: "List do Gammy." },
  { company: null, title: null, text: "List bez firmy." },
]

beforeEach(() => {
  clearFormLetters()
  mocked(findJobByUrl).mockReset().mockResolvedValue(null)
  mocked(assertOfferReadLimit).mockReset().mockResolvedValue(undefined)
  mocked(recentLetters).mockReset().mockResolvedValue(past)
  mocked(letterForJob).mockReset().mockResolvedValue(null)
  mocked(generalLetterForJob).mockReset().mockResolvedValue(null)
  mocked(generateLetterForJob).mockReset()
  mocked(writeLetterForPage).mockReset()
  mocked(addOfferByLink).mockReset().mockResolvedValue({ kind: "invalid" })
  mocked(cvPdf).mockReset()
  mocked(contentPdf).mockReset()
})

describe("letterText", () => {
  const content = letter(["Piszę w sprawie roli Staff Engineer.", "Zbudowałem platformę."])

  it("puts the greeting and the sign-off around the paragraphs", () => {
    expect(letterText(content)).toBe(
      [
        "Szanowni Państwo,",
        "Piszę w sprawie roli Staff Engineer.\n\nZbudowałem platformę.",
        `Z poważaniem,\n${content.header.name}`,
      ].join("\n\n")
    )
  })

  it("drops them, then cuts at a sentence, when the field is shorter", () => {
    expect(letterText(content, 70)).toBe(
      "Piszę w sprawie roli Staff Engineer.\n\nZbudowałem platformę."
    )
    expect(letterText(content, 45)).toBe("Piszę w sprawie roli Staff Engineer.")
  })

  it("is empty for a document that is not a letter", () => {
    expect(letterText(syntheticCv(1))).toBe("")
  })
})

describe("paragraphBudget", () => {
  it("leaves room for the greeting and the sign-off in a field with a limit", () => {
    expect(paragraphBudget(undefined)).toBeUndefined()
    expect(paragraphBudget(0)).toBeUndefined()
    expect(paragraphBudget(2000)).toBe(1920)
    expect(paragraphBudget(300)).toBe(300)
  })
})

describe("writeFormLetter", () => {
  it("fills in the letter the offer already has, without the model", async () => {
    mocked(findJobByUrl).mockImplementation(async (url: string) =>
      url === "https://jobs.lever.co/acme/uuid" ? { id: "job1" } : null
    )
    mocked(letterForJob).mockResolvedValue({
      id: "doc1",
      content: letter(["Mój poprawiony list."]),
      language: "pl",
    })
    const result = await writeFormLetter(input())
    expect(result.letter).toMatchObject({ documentId: "doc1", created: false, pastLetters: 0 })
    expect(result.letter.text).toContain("Mój poprawiony list.")
    expect(generateLetterForJob).not.toHaveBeenCalled()
    expect(addOfferByLink).not.toHaveBeenCalled()
  })

  it("writes a new letter for an offer from the whole posting and the last three letters", async () => {
    mocked(findJobByUrl).mockResolvedValue({ id: "job1" })
    mocked(generateLetterForJob).mockResolvedValue({
      id: "doc2",
      content: letter(["Nowy list."]),
      language: "pl",
    })
    const result = await writeFormLetter(input({ maxChars: 2000 }))
    expect(recentLetters).toHaveBeenCalledWith(1, { exceptJobId: "job1", exceptId: undefined })
    expect(generateLetterForJob).toHaveBeenCalledWith({
      userId: 1,
      jobId: "job1",
      pastLetters: past,
      general: null,
      maxChars: 1920,
      pageText: page.text,
    })
    expect(result.letter).toMatchObject({
      documentId: "doc2",
      created: true,
      pastLetters: 3,
      general: false,
    })
  })

  it("makes the letter from the general letter of the CV, which past letters then leave out", async () => {
    mocked(findJobByUrl).mockResolvedValue({ id: "job1" })
    const general = { id: "gen1", content: letter(["Mój list ogólny."]), language: "pl" as const }
    mocked(generalLetterForJob).mockResolvedValue(general)
    mocked(generateLetterForJob).mockResolvedValue({
      id: "doc2",
      content: letter(["Nowy list."]),
      language: "pl",
    })
    const result = await writeFormLetter(input())
    expect(generalLetterForJob).toHaveBeenCalledWith(1, "job1")
    expect(recentLetters).toHaveBeenCalledWith(1, { exceptJobId: "job1", exceptId: "gen1" })
    expect(generateLetterForJob).toHaveBeenCalledWith(expect.objectContaining({ general }))
    expect(result.letter).toMatchObject({ created: true, general: true })
  })

  it("reads an offer the index does not know, as adding it by its link does", async () => {
    mocked(addOfferByLink).mockResolvedValue({ kind: "added", jobId: "job9" })
    mocked(generateLetterForJob).mockResolvedValue({
      id: "doc9",
      content: letter(["List."]),
      language: "pl",
    })
    await writeFormLetter(input())
    expect(addOfferByLink).toHaveBeenCalledWith(1, page.url)
    expect(generateLetterForJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: "job9" }))
  })

  it("writes from what reading gave for a page outside the index, and keeps it nowhere", async () => {
    const posting = `Acme szuka Staff Engineera. ${"Kubernetes i Go. ".repeat(20)}`
    mocked(addOfferByLink).mockResolvedValue({
      kind: "draft",
      url: "https://acme.example/kariera/1",
      outcome: "partial",
      facts: { jobId: null, company: "Acme", title: "Staff Engineer", location: "Warszawa" },
      text: posting,
      withheld: false,
    })
    mocked(writeLetterForPage).mockResolvedValue({ content: letter(["List."]), language: "pl" })
    const result = await writeFormLetter(input())
    expect(writeLetterForPage).toHaveBeenCalledWith({
      userId: 1,
      offer: {
        company: "Acme",
        title: "Staff Engineer",
        location: "Warszawa",
        text: posting,
        origin: "full",
      },
      pastLetters: past,
      general: null,
      maxChars: undefined,
    })
    expect(generalLetterForJob).toHaveBeenCalledWith(1, null)
    expect(recentLetters).toHaveBeenCalledWith(1, { exceptId: undefined })
    expect(result.letter).toMatchObject({ documentId: null, created: true, pastLetters: 3 })
  })

  it("gives the model no text of a site that opts out of AI", async () => {
    mocked(addOfferByLink).mockResolvedValue({
      kind: "draft",
      url: page.url,
      outcome: "partial",
      facts: { jobId: null, company: "Acme", title: "Staff Engineer", location: null },
      text: "",
      withheld: true,
    })
    mocked(writeLetterForPage).mockResolvedValue({ content: letter(["List."]), language: "pl" })
    await writeFormLetter(input())
    expect(mocked(writeLetterForPage).mock.calls[0][0].offer).toMatchObject({
      text: "",
      origin: "withheld",
    })
  })

  it("uses the open page and what fill read when the link cannot be read", async () => {
    mocked(assertOfferReadLimit).mockRejectedValue(new Error("Too many links read."))
    mocked(writeLetterForPage).mockResolvedValue({ content: letter(["List."]), language: "pl" })
    await writeFormLetter(
      input({ job: Promise.resolve({ company: "Acme", title: "SRE", location: null }) })
    )
    expect(addOfferByLink).not.toHaveBeenCalled()
    expect(mocked(writeLetterForPage).mock.calls[0][0].offer).toMatchObject({
      company: "Acme",
      title: "SRE",
      text: page.text,
      origin: "full",
    })
  })

  it("does not write without knowing the company", async () => {
    await expect(writeFormLetter(input())).rejects.toThrow(/do jakiej firmy/)
    expect(writeLetterForPage).not.toHaveBeenCalled()
  })
})

describe("letters in progress", () => {
  const done: WrittenLetter = {
    letter: { text: "List.", documentId: null, created: true, pastLetters: 2, general: false },
    content: letter(["List."]),
    language: "pl",
  }

  async function settle() {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0))
  }

  it("is pending, then done, and only for the person who started it", async () => {
    let finish: (value: WrittenLetter) => void = () => undefined
    const id = startFormLetter(input(), () => new Promise((resolve) => (finish = resolve)))
    expect(formLetterStatus(1, id)).toEqual({ status: "pending" })
    finish(done)
    await settle()
    expect(formLetterStatus(1, id)).toEqual({ status: "done", letter: done.letter })
    expect(formLetterStatus(2, id)).toBeNull()
    expect(formLetterStatus(1, "unknown")).toBeNull()
  })

  it("gives the same letter to the same form filled again", async () => {
    const write = vi.fn(async () => done)
    const first = startFormLetter(input(), write)
    const again = startFormLetter(
      input({ page: { ...page, url: "https://jobs.lever.co/acme/uuid" } }),
      write
    )
    expect(again).toBe(first)
    expect(write).toHaveBeenCalledTimes(1)
    expect(startFormLetter(input({ maxChars: 500 }), write)).not.toBe(first)
  })

  it("says why there is no letter, and lets the next fill try again", async () => {
    const write = vi.fn(async () => {
      throw new CvError("llm-unavailable", "No model is configured.")
    })
    const id = startFormLetter(input(), write)
    await settle()
    expect(formLetterStatus(1, id)).toEqual({
      status: "failed",
      error: "Model nie jest skonfigurowany, więc nie napiszę listu.",
    })
    expect(startFormLetter(input(), write)).not.toBe(id)
  })

  it("renders the PDF of a letter kept nowhere, and the offer's letter as it is now", async () => {
    const pdf = { bytes: Buffer.from("%PDF"), name: "List.pdf" }
    mocked(contentPdf).mockResolvedValue(pdf)
    mocked(cvPdf).mockResolvedValue(pdf)
    const loose = startFormLetter(input(), async () => done)
    const kept = startFormLetter(input({ maxChars: 900 }), async () => ({
      ...done,
      letter: { ...done.letter, documentId: "doc1" },
    }))
    await settle()
    expect(await formLetterPdf(1, loose)).toBe(pdf)
    expect(contentPdf).toHaveBeenCalledWith(done.content, "LETTER", "pl")
    expect(await formLetterPdf(1, kept)).toBe(pdf)
    expect(cvPdf).toHaveBeenCalledWith(1, "doc1", { leaves: true })
    expect(await formLetterPdf(2, kept)).toBeNull()
  })
})
