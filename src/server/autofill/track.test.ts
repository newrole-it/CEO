import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("src/server/answers/service", () => ({
  formPrivacy: vi.fn(async () => ({ personal: [], names: [] })),
  recordFormAnswers: vi.fn(),
}))
vi.mock("src/server/applications/service", () => ({
  addApplicationNote: vi.fn(),
  createApplication: vi.fn(),
  findApplicationByUrl: vi.fn(),
  findJobByUrl: vi.fn(),
  saveFormAnswers: vi.fn(),
}))
vi.mock("src/server/llm/client", () => ({ createLlmClient: vi.fn(() => null) }))

import { recordFormAnswers } from "src/server/answers/service"
import {
  addApplicationNote,
  createApplication,
  findApplicationByUrl,
  findJobByUrl,
  saveFormAnswers,
} from "src/server/applications/service"
import { personalNames, personalValues } from "src/server/answers/filter"
import { answerPairs, formAnswers, RESENT_NOTE, trackSubmission } from "./track"

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const page = {
  url: "https://jobs.lever.co/acme/uuid/apply",
  title: "Acme - Staff Engineer",
  text: "We build robots.",
}

const application = {
  id: "app1",
  company: "Acme",
  title: "Staff Engineer",
  status: "APPLIED",
  notes: "private",
}

beforeEach(() => {
  mocked(recordFormAnswers).mockReset().mockResolvedValue({ saved: 1, reused: 0 })
  mocked(addApplicationNote).mockReset().mockResolvedValue(application)
  mocked(createApplication).mockReset().mockResolvedValue({ application, created: true })
  mocked(findApplicationByUrl).mockReset().mockResolvedValue(null)
  mocked(findJobByUrl).mockReset().mockResolvedValue(null)
  mocked(saveFormAnswers).mockReset().mockResolvedValue(undefined)
})

describe("formAnswers", () => {
  it("keeps every answer, salary, notice period and short fields included", () => {
    expect(
      formAnswers([
        { label: "Oczekiwania finansowe", value: "20 000 - 25 000 PLN netto" },
        { label: "Okres wypowiedzenia", value: "1 miesiąc" },
        { label: "Earliest start date", value: "2026-12-01" },
        { label: "Years of experience", value: "12" },
        { label: "Why do you want to join us?", value: "Bo tak.", type: "textarea" },
        { label: "Which languages?", value: "Java, Go", type: "checkbox" },
      ])
    ).toEqual([
      { question: "Oczekiwania finansowe", answer: "20 000 - 25 000 PLN netto", kind: "salary" },
      { question: "Okres wypowiedzenia", answer: "1 miesiąc", kind: "noticePeriod" },
      { question: "Earliest start date", answer: "2026-12-01", kind: "availableFrom" },
      { question: "Years of experience", answer: "12", kind: "other" },
      { question: "Why do you want to join us?", answer: "Bo tak.", kind: "openQuestion" },
      { question: "Which languages?", answer: "Java, Go", kind: "choiceQuestion" },
    ])
  })

  it("keeps questions about the work, even with words that also mean personal data", () => {
    const answer = "Zbudowałem asystenta do analizy umów, wdrożony u 40 klientów w trzy miesiące."
    const questions = [
      "Jaki ostatnio produkt zrobiłeś przy pomocy AI?",
      "What is the name of the last product you built with AI?",
      "Name a product you built that you are proud of",
      "How do you handle race conditions in distributed systems?",
      "Have you built mobile apps?",
      "Have you sent e-mail campaigns?",
      "How do you ensure GDPR compliance in your product?",
      "Describe a data processing pipeline you designed",
      "How did you build for disabled users?",
      "Opisz kampanię marketing automation, którą prowadziłeś, i czego się z niej nauczyłeś",
      "Jak wygląda u Ciebie orientacja na klienta?",
      "Ostatni produkt z AI",
    ]
    const rows = formAnswers(questions.map((label) => ({ label, value: answer, type: "textarea" })))
    expect(rows.map((row) => row.question)).toEqual(questions)
    for (const row of rows) expect(row.answer).toBe(answer)
  })

  it("keeps a short answer about the work", () => {
    expect(
      formAnswers([
        { label: "Have you built mobile apps?", value: "Tak", type: "select" },
        { label: "Tech stack", value: "Kotlin, Kafka" },
        { label: "Years of experience", value: "8" },
      ]).map((row) => row.answer)
    ).toEqual(["Tak", "Kotlin, Kafka", "8"])
  })

  it("keeps no personal data, whatever the extension claims", () => {
    expect(
      formAnswers([
        { label: "First Name", value: "Rafał", kind: "openQuestion" },
        { label: "Email", value: "a@b.pl", kind: "openQuestion" },
        { label: "What is your phone?", value: "600100200", kind: "openQuestion" },
        { label: "City", value: "Warszawa", kind: "openQuestion" },
        { label: "Where are you based?", value: "Warszawa" },
        { label: "LinkedIn Profile", value: "https://linkedin.com/in/x", kind: "openQuestion" },
        { label: "Portfolio", value: "https://x.dev", kind: "openQuestion" },
        { label: "Twitter", value: "@mw" },
        { label: "Referred by? Give their contact", value: "jan@firma.pl", kind: "openQuestion" },
        { label: "Kto Cię polecił?", value: "Anna Nowak" },
        { label: "Your best number, please?", value: "+48 600 000 000", kind: "openQuestion" },
        { label: "Gender", value: "Male", kind: "openQuestion" },
        { label: "Obywatelstwo", value: "polskie" },
        { label: "PESEL", value: "90010112345", kind: "salary" },
        { label: "Numer karty", value: "4111 1111 1111 1111" },
        { label: "Any reference number?", value: "90010112345", kind: "openQuestion" },
        { label: "I agree to the Privacy Policy", value: "Tak", type: "checkbox" },
        { label: "Password", value: "hunter2", kind: "salary", type: "password" },
        { label: "Resume/CV", value: "CV.pdf", type: "file" },
      ])
    ).toEqual([])
  })

  it("replaces contacts and the person's name inside a longer answer", () => {
    const details = {
      name: "Rafał Testowy",
      email: "rafal@example.com",
      applicant: { firstName: "Rafał", lastName: "Testowy" },
    }
    const privacy = { personal: personalValues(details), names: personalNames(details) }
    const letter = `${"Chętnie dołączę do zespołu i opowiem o projektach. ".repeat(
      5
    )}Pozdrawiam, Rafał Testowy, a@b.pl, +48 600 100 200`
    const rows = formAnswers(
      [
        { label: "Cover letter", value: letter, type: "textarea" },
        { label: "Kim jesteś?", value: "Rafał Testowy" },
      ],
      privacy
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].answer).toContain("Pozdrawiam, [imię i nazwisko], [e-mail], [telefon]")
    expect(rows[0].answer).not.toMatch(/Testowy|a@b\.pl|600 100/)
  })

  it("does not take a large salary for a card number", () => {
    expect(formAnswers([{ label: "Salary", value: "1200000-1500000" }])).toEqual([
      { question: "Salary", answer: "1200000-1500000", kind: "salary" },
    ])
  })

  it("skips what is not an answer", () => {
    expect(
      formAnswers([
        { label: "Empty?", value: "   " },
        { label: "", value: "No question" },
      ])
    ).toEqual([])
  })

  it("joins answers under one label", () => {
    expect(
      formAnswers([
        { label: "Current employer", value: "Acme" },
        { label: "Current employer", value: "Bravo" },
        { label: "Current employer", value: "Bravo" },
      ])
    ).toEqual([{ question: "Current employer", answer: "Acme\nBravo", kind: "other" }])
  })

  it("trusts a salary kind from either side", () => {
    expect(formAnswers([{ label: "Twoje oczekiwania", value: "20k", kind: "salary" }])).toEqual([
      { question: "Twoje oczekiwania", answer: "20k", kind: "salary" },
    ])
  })
})

describe("answerPairs", () => {
  it("keeps questions and drops personal data, whatever the extension claims", () => {
    const pairs = answerPairs([
      {
        label: "Why do you want to join us?",
        value: "Bo tak.",
        kind: "openQuestion",
        type: "textarea",
      },
      { label: "Used Kubernetes?", value: "Yes", kind: "choiceQuestion", type: "select" },
      { label: "How did you hear about us?", value: "LinkedIn", kind: "howHeard" },
      { label: "First Name", value: "Rafał", kind: "firstName" },
      { label: "First Name", value: "Rafał", kind: "openQuestion" },
      { label: "Email", value: "a@b.pl", kind: "openQuestion" },
      {
        label: "Referred by a colleague? Give their contact",
        value: "jan@firma.pl",
        kind: "openQuestion",
      },
      {
        label: "Your best contact number, please?",
        value: "+48 600 000 000",
        kind: "openQuestion",
      },
      { label: "Gender", value: "Male", kind: "openQuestion" },
      { label: "PESEL", value: "90010112345", kind: "openQuestion" },
      { label: "Any reference number for you?", value: "90010112345", kind: "openQuestion" },
      {
        label: "I agree to the Privacy Policy",
        value: "yes",
        kind: "openQuestion",
        type: "checkbox",
      },
      { label: "Password", value: "hunter2", kind: "openQuestion", type: "password" },
      { label: "Empty answer?", value: "   ", kind: "openQuestion" },
      { label: "", value: "No question", kind: "openQuestion" },
      {
        label: "Why do you want to join us?",
        value: "Duplicate",
        kind: "openQuestion",
        type: "textarea",
      },
    ])
    expect(pairs).toEqual([
      { question: "Why do you want to join us?", answer: "Bo tak." },
      { question: "Used Kubernetes?", answer: "Yes" },
      { question: "How did you hear about us?", answer: "LinkedIn" },
    ])
  })

  it("takes short questions about the work too, to find them again in the bank", () => {
    expect(
      answerPairs([
        { label: "Ostatni produkt z AI", value: "Asystent do umów" },
        { label: "Tech stack", value: "Kotlin, Kafka" },
        { label: "Twitter", value: "@mw" },
        { label: "Kto Cię polecił?", value: "Anna Nowak" },
      ])
    ).toEqual([
      { question: "Ostatni produkt z AI", answer: "Asystent do umów" },
      { question: "Tech stack", answer: "Kotlin, Kafka" },
    ])
  })

  it("classifies by itself when the extension sends no kind", () => {
    expect(
      answerPairs([
        { label: "Describe a project you are proud of", value: "Migracja.", type: "textarea" },
        { label: "Nickname", value: "Mike" },
      ])
    ).toEqual([{ question: "Describe a project you are proud of", answer: "Migracja." }])
  })
})

describe("trackSubmission", () => {
  const fields = [{ label: "Why us?", value: "Bo tak.", kind: "openQuestion", type: "textarea" }]

  it("creates an application for the posting URL and records the answers", async () => {
    const result = await trackSubmission({
      userId: 2,
      page,
      job: { company: "Acme", title: "Staff Engineer" },
      fields,
    })
    expect(createApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 2,
        url: "https://jobs.lever.co/acme/uuid",
        company: "Acme",
        title: "Staff Engineer",
        source: "extension",
        channel: "extension",
      })
    )
    expect(addApplicationNote).not.toHaveBeenCalled()
    expect(recordFormAnswers).toHaveBeenCalledWith({
      userId: 2,
      applicationId: "app1",
      company: "Acme",
      jobTitle: "Staff Engineer",
      sourceUrl: "https://jobs.lever.co/acme/uuid",
      pairs: [{ question: "Why us?", answer: "Bo tak." }],
    })
    expect(result).toEqual({
      application: { id: "app1", company: "Acme", title: "Staff Engineer", status: "APPLIED" },
      created: true,
      answers: { saved: 1, reused: 0 },
    })
  })

  it("keeps the whole form on the application, new or already tracked", async () => {
    const form = [
      { label: "Oczekiwania finansowe", value: "20 000 PLN" },
      { label: "Why us?", value: "Bo tak.", type: "textarea" },
    ]
    const saved = [
      { question: "Oczekiwania finansowe", answer: "20 000 PLN", kind: "salary" },
      { question: "Why us?", answer: "Bo tak.", kind: "openQuestion" },
    ]
    await trackSubmission({ userId: 2, page, fields: form })
    expect(saveFormAnswers).toHaveBeenLastCalledWith(2, "app1", saved, "extension")
    mocked(findApplicationByUrl).mockResolvedValue({ ...application, status: "INTERVIEW" })
    await trackSubmission({ userId: 2, page, fields: form })
    expect(saveFormAnswers).toHaveBeenCalledTimes(2)
    expect(saveFormAnswers).toHaveBeenLastCalledWith(2, "app1", saved, "extension")
  })

  it("does not put salary into the answer bank, which reuses answers in later forms", async () => {
    await trackSubmission({
      userId: 2,
      page,
      fields: [{ label: "Oczekiwania finansowe", value: "20 000 PLN" }],
    })
    expect(recordFormAnswers).not.toHaveBeenCalled()
  })

  it("reads the job from the page when the extension sends none", async () => {
    await trackSubmission({ userId: 2, page, fields: [] })
    expect(createApplication).toHaveBeenCalledWith(
      expect.objectContaining({ company: "Acme", title: "Staff Engineer" })
    )
    expect(recordFormAnswers).not.toHaveBeenCalled()
  })

  it("adds a note when an APPLIED application is sent again", async () => {
    mocked(findApplicationByUrl).mockResolvedValue(application)
    const result = await trackSubmission({ userId: 2, page, fields: [] })
    expect(createApplication).not.toHaveBeenCalled()
    expect(addApplicationNote).toHaveBeenCalledWith(2, "app1", RESENT_NOTE, "extension")
    expect(result.created).toBe(false)
    expect(result.answers).toEqual({ saved: 0, reused: 0 })
  })

  it("leaves an application that moved on without a note", async () => {
    mocked(findApplicationByUrl).mockResolvedValue({ ...application, status: "INTERVIEW" })
    const result = await trackSubmission({ userId: 2, page, fields })
    expect(addApplicationNote).not.toHaveBeenCalled()
    expect(result.application.status).toBe("INTERVIEW")
  })

  it("adds the note when the same offer is found under another link", async () => {
    mocked(createApplication).mockResolvedValue({ application, created: false })
    const result = await trackSubmission({
      userId: 2,
      page,
      job: { company: "Acme", title: "SRE" },
      fields: [],
    })
    expect(addApplicationNote).toHaveBeenCalledTimes(1)
    expect(result.created).toBe(false)
  })
})
