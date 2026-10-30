import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("src/server/answers/service", () => ({ recordFormAnswers: vi.fn() }))
vi.mock("src/server/applications/service", () => ({
  addApplicationNote: vi.fn(),
  createApplication: vi.fn(),
  findApplicationByUrl: vi.fn(),
  findJobByUrl: vi.fn(),
}))
vi.mock("src/server/llm/client", () => ({ createLlmClient: vi.fn(() => null) }))

import { recordFormAnswers } from "src/server/answers/service"
import {
  addApplicationNote,
  createApplication,
  findApplicationByUrl,
  findJobByUrl,
} from "src/server/applications/service"
import { answerPairs, RESENT_NOTE, trackSubmission } from "./track"

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
