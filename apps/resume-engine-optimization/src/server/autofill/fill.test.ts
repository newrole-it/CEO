import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FormField } from "./fields"

// vitest 0.25 has no vi.hoisted: each mocked module owns its own spies.
vi.mock("src/server/answers/service", () => ({ draftAnswers: vi.fn() }))
vi.mock("src/server/applications/service", () => ({
  findApplicationByUrl: vi.fn(),
  findJobByUrl: vi.fn(),
}))
vi.mock("src/server/cv/service", () => ({ defaultCv: vi.fn(), tailoredCv: vi.fn() }))
vi.mock("src/server/profile/applicant", () => ({ getApplicant: vi.fn() }))
vi.mock("src/server/llm/client", () => ({ createLlmClient: vi.fn(() => null) }))
vi.mock("./letter", () => ({ startFormLetter: vi.fn(() => "letter1") }))

import { draftAnswers } from "src/server/answers/service"
import { findApplicationByUrl, findJobByUrl } from "src/server/applications/service"
import { defaultCv, tailoredCv } from "src/server/cv/service"
import { createLlmClient } from "src/server/llm/client"
import { getApplicant } from "src/server/profile/applicant"
import { fillForm, planFill } from "./fill"
import { startFormLetter } from "./letter"

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>

const applicant = {
  firstName: "Rafał",
  lastName: "Testowy",
  email: "rafal@example.com",
  country: "Polska",
  workAuthorization: "Obywatelstwo PL/UE, bez sponsorowania wizy",
}

const f = (key: string, label: string, extra: Partial<FormField> = {}): FormField => ({
  key,
  label,
  type: "text",
  ...extra,
})

const page = {
  url: "https://jobs.lever.co/acme/uuid/apply",
  title: "Acme - Staff Engineer",
  text: "We build robots.",
}

beforeEach(() => {
  mocked(draftAnswers).mockReset().mockResolvedValue({})
  mocked(findApplicationByUrl).mockReset().mockResolvedValue(null)
  mocked(findJobByUrl).mockReset().mockResolvedValue(null)
  mocked(defaultCv).mockReset().mockResolvedValue({ id: "cv1", title: "CV PL" })
  mocked(tailoredCv).mockReset().mockResolvedValue(null)
  mocked(getApplicant).mockReset().mockResolvedValue({ saved: {}, effective: applicant })
  mocked(startFormLetter).mockClear()
})

describe("planFill", () => {
  it("fills what the profile knows and leaves the questions for drafting", () => {
    const plan = planFill(
      [
        f("a", "Full name"),
        f("b", "Email", { type: "email" }),
        f("c", "Country", { type: "select", options: ["Select", "Poland", "Germany"] }),
        f("d", "Will you require visa sponsorship?", { type: "radio", options: ["Yes", "No"] }),
        f("e", "Resume/CV", { type: "file" }),
        f("f", "Why do you want to join?", { type: "textarea", maxLength: 500 }),
        f("g", "Salary expectations"),
        f("h", "Cover Letter", { type: "file" }),
      ],
      applicant,
      { id: "cv1", title: "CV PL" }
    )
    const value = (key: string) => plan.values.get(key)
    expect(value("a")).toMatchObject({
      value: "Rafał Testowy",
      kind: "fullName",
      source: "profile",
    })
    expect(value("b")).toMatchObject({ value: "rafal@example.com", source: "profile" })
    expect(value("c")).toMatchObject({ value: "Poland", source: "profile" })
    expect(value("d")).toMatchObject({ value: "No", kind: "workAuthorization", source: "profile" })
    expect(value("e")).toMatchObject({ kind: "resume", source: "cv", documentId: "cv1" })
    expect(value("h")).toMatchObject({ kind: "coverLetter", source: "letter", value: "" })
    expect(plan.letter).toEqual({})
    expect(plan.questions.map((question) => question.key)).toEqual(["f", "g"])
    expect(plan.questions[0]).toMatchObject({ question: "Why do you want to join?", maxChars: 500 })
  })

  it("leaves the whole letter to the letter writer, a choice about it to the drafts", () => {
    const plan = planFill(
      [
        f("a", "Cover letter", { type: "textarea", maxLength: 3000 }),
        f("b", "List motywacyjny", { type: "contenteditable", maxLength: 1500 }),
        f("c", "Cover Letter", { type: "file" }),
        f("d", "Cover letter", { type: "select", options: ["Upload", "Type it"] }),
        f("e", "Reference letter", { type: "file" }),
        f("f", "Letter of recommendation", { type: "textarea" }),
      ],
      applicant,
      null
    )
    for (const key of ["a", "b", "c"]) {
      expect(plan.values.get(key)).toMatchObject({ kind: "coverLetter", source: "letter" })
    }
    expect(plan.letter).toEqual({ maxChars: 1500 })
    expect(plan.questions.map((question) => question.key)).toEqual(["d"])
    expect(plan.values.get("e")).toMatchObject({ kind: "other", source: "skip" })
    expect(plan.values.get("f")).toMatchObject({ kind: "other", source: "skip" })
  })

  it("skips never-fill fields, and a CV field when there is no CV", () => {
    const plan = planFill(
      [
        f("a", "Gender", { type: "select", options: ["Male", "Female"] }),
        f("b", "I agree to the Privacy Policy", { type: "checkbox" }),
        f("c", "PESEL"),
        f("d", "Address"),
        f("e", "Resume", { type: "file" }),
        f("f", "Nickname"),
      ],
      applicant,
      null
    )
    expect(plan.questions).toEqual([])
    expect(plan.letter).toBeNull()
    for (const key of ["a", "b", "c", "d", "e", "f"]) {
      expect(plan.values.get(key)).toMatchObject({ value: "", source: "skip" })
    }
  })
})

describe("fillForm", () => {
  it("answers §5.3 with values in field order, one draft batch, job and applied", async () => {
    mocked(draftAnswers).mockResolvedValue({
      q1: { text: "Bo robicie roboty.", basedOn: ["ans1"], reader: "reuse" },
      q2: { text: "Szkic o migracji.", basedOn: ["ans2"], reader: "llm" },
      q3: { text: "", basedOn: [], reader: "none" },
      q4: { text: "Yes, 5 years", basedOn: [], reader: "llm" },
    })
    const appliedAt = new Date("2026-10-12T10:00:00Z")
    mocked(findApplicationByUrl).mockResolvedValue({
      id: "app1",
      status: "SCREENING",
      appliedAt,
      notes: "private",
    })

    const result = await fillForm({
      userId: 2,
      page,
      fields: [
        f("name", "Full name"),
        f("q1", "Why us?", { type: "textarea" }),
        f("q2", "Describe a migration", { type: "textarea" }),
        f("q3", "What else should we know?", { type: "textarea" }),
        f("q4", "Used Kubernetes?", { type: "select", options: ["Yes", "No"] }),
        f("cv", "Resume/CV", { type: "file" }),
        f("eeo", "Gender", { type: "select", options: ["Male"] }),
      ],
    })

    expect(draftAnswers).toHaveBeenCalledTimes(1)
    const call = mocked(draftAnswers).mock.calls[0][0]
    expect(call.userId).toBe(2)
    expect(call.questions.map((question: { key: string }) => question.key)).toEqual([
      "q1",
      "q2",
      "q3",
      "q4",
    ])
    expect(call.questions[3].options).toEqual(["Yes", "No"])
    expect(call.context).toMatchObject({
      company: "Acme",
      jobTitle: "Staff Engineer",
      jobText: "We build robots.",
      url: "https://jobs.lever.co/acme/uuid",
    })
    expect(JSON.stringify(call)).not.toContain("Gender")

    expect(result.values).toEqual([
      { key: "name", value: "Rafał Testowy", kind: "fullName", source: "profile" },
      {
        key: "q1",
        value: "Bo robicie roboty.",
        kind: "openQuestion",
        source: "answers",
        answerId: "ans1",
      },
      { key: "q2", value: "Szkic o migracji.", kind: "openQuestion", source: "ai" },
      { key: "q3", value: "", kind: "openQuestion", source: "skip" },
      { key: "q4", value: "Yes", kind: "choiceQuestion", source: "ai" },
      { key: "cv", value: "CV PL", kind: "resume", source: "cv", documentId: "cv1" },
      { key: "eeo", value: "", kind: "eeo", source: "skip" },
    ])
    expect(result.job).toEqual({ company: "Acme", title: "Staff Engineer" })
    expect(result.applied).toEqual({ id: "app1", status: "SCREENING", appliedAt })
    expect(result.letter).toBeNull()
    expect(startFormLetter).not.toHaveBeenCalled()
  })

  it("starts the cover letter and answers before it is written", async () => {
    const result = await fillForm({
      userId: 2,
      page,
      fields: [
        f("why", "Why us?", { type: "textarea" }),
        f("letter", "Cover letter", { type: "textarea", maxLength: 2500 }),
      ],
    })
    expect(result.letter).toEqual({ id: "letter1" })
    expect(result.values[1]).toEqual({
      key: "letter",
      value: "",
      kind: "coverLetter",
      source: "letter",
    })
    expect(mocked(draftAnswers).mock.calls[0][0].questions).toHaveLength(1)
    const started = mocked(startFormLetter).mock.calls[0][0]
    expect(started).toMatchObject({
      userId: 2,
      page: { url: "https://jobs.lever.co/acme/uuid" },
      maxChars: 2500,
    })
    // what fill read about the posting, for a page the index does not know
    expect(await started.job).toEqual({ company: "Acme", title: "Staff Engineer", location: null })
  })

  it("does not call the model when no field needs it", async () => {
    const result = await fillForm({ userId: 2, page, fields: [f("a", "Email", { type: "email" })] })
    expect(draftAnswers).not.toHaveBeenCalled()
    expect(result.applied).toBeNull()
  })

  it("prefers the indexed offer, and survives failing drafts and a missing CV service", async () => {
    mocked(findJobByUrl).mockResolvedValue({
      company: { name: "Acme Robotics S.A." },
      title: "Staff Platform Engineer",
      locationText: "Warszawa",
    })
    mocked(draftAnswers).mockRejectedValue(new Error("model down"))
    mocked(defaultCv).mockRejectedValue(new Error("no table"))
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const result = await fillForm({
      userId: 2,
      page,
      fields: [f("q", "Why us?", { type: "textarea" }), f("cv", "Resume", { type: "file" })],
    })
    error.mockRestore()
    expect(result.job).toEqual({ company: "Acme Robotics S.A.", title: "Staff Platform Engineer" })
    expect(result.values.map((value) => value.source)).toEqual(["skip", "skip"])
  })

  it("does not tell the draft that a part of the window title is the employer", async () => {
    mocked(draftAnswers).mockResolvedValue({})
    const result = await fillForm({
      userId: 2,
      page: {
        url: "https://careers.acme.com/1",
        title: "Staff Engineer - Warsaw",
        text: "We build robots.",
      },
      fields: [f("q", "Why us?", { type: "textarea" })],
    })
    expect(mocked(draftAnswers).mock.calls[0][0].context).toMatchObject({
      company: null,
      jobTitle: "Staff Engineer",
    })
    expect(result.job).toEqual({ company: "Acme", title: "Staff Engineer" })
  })

  it("gives the draft the company the page's own data names", async () => {
    mocked(draftAnswers).mockResolvedValue({})
    await fillForm({
      userId: 2,
      page: { ...page, company: "Acme Robotics S.A.", role: "Staff Platform Engineer" },
      fields: [f("q", "Why us?", { type: "textarea" })],
    })
    expect(mocked(draftAnswers).mock.calls[0][0].context).toMatchObject({
      company: "Acme Robotics S.A.",
      jobTitle: "Staff Platform Engineer",
    })
  })

  it("names no company on LinkedIn's feed, and does not ask the model", async () => {
    vi.mocked(createLlmClient).mockClear()
    const result = await fillForm({
      userId: 2,
      page: {
        url: "https://www.linkedin.com/feed/",
        title: "Kanał informacji | LinkedIn",
        text: "Post",
      },
      fields: [f("a", "Email", { type: "email" })],
    })
    expect(result.job).toBeNull()
    expect(createLlmClient).not.toHaveBeenCalled()
  })
})
