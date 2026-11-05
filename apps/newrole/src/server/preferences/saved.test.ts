import { describe, expect, it, vi } from "vitest"
import { listSaved, offerStages, segmentOf } from "./saved"

/** Offers: a liked one, a liked one with a CV, one with only a letter, one sent and one passed. */
vi.mock("db", () => {
  type Row = Record<string, any>
  const at = (day: number) => new Date(Date.UTC(2026, 10, day))
  const job = (id: string, title: string, status = "ACTIVE") => ({
    id,
    title,
    originalUrl: `https://careers.acme.example/${id}`,
    canonicalUrl: "",
    status,
    company: { name: "Acme" },
  })
  const jobs = [
    job("j-liked", "Backend Engineer"),
    job("j-ready", "Staff Engineer", "CLOSED"),
    job("j-letter", "Platform Engineer"),
    job("j-sent", "Data Engineer"),
    job("j-passed", "QA Engineer"),
  ]
  const feedback = [
    ["j-liked", "LIKE", 1],
    ["j-ready", "LIKE", 2],
    ["j-sent", "APPLIED", 3],
    ["j-passed", "DISLIKE", 4],
  ].map(([jobId, verdict, day]) => ({
    id: `f-${jobId}`,
    userId: 1,
    jobId,
    verdict,
    aspects: [],
    tags: [],
    note: null,
    channel: "web",
    createdAt: at(day as number),
    updatedAt: at(day as number),
    job: jobs.find((item) => item.id === jobId),
  }))
  const documents = [
    {
      id: "cv-ready",
      userId: 1,
      jobId: "j-ready",
      docType: "CV",
      language: "en",
      updatedAt: at(9),
    },
    {
      id: "letter-only",
      userId: 1,
      jobId: "j-letter",
      docType: "LETTER",
      language: "pl",
      updatedAt: at(5),
    },
    { id: "cv-sent", userId: 1, jobId: "j-sent", docType: "CV", language: "pl", updatedAt: at(2) },
    { id: "cv-general", userId: 1, jobId: null, docType: "CV", language: "pl", updatedAt: at(1) },
  ]
  const inList = (where: Row, key: string, value: unknown) =>
    !where[key]?.in || where[key].in.includes(value)
  return {
    default: {
      offerFeedback: {
        findMany: async ({ where }: { where: Row }) =>
          feedback.filter(
            (row) => row.userId === where.userId && inList(where, "jobId", row.jobId)
          ),
      },
      cvDocument: {
        findMany: async ({ where }: { where: Row }) =>
          documents.filter((row) => row.userId === where.userId && row.jobId !== null),
      },
      application: {
        findMany: async ({ where }: { where: Row }) =>
          [{ id: "app-sent", jobId: "j-sent" }].filter((row) => inList(where, "jobId", row.jobId)),
      },
      job: {
        findMany: async ({ where }: { where: Row }) =>
          jobs.filter((row) => inList(where, "id", row.id)),
      },
    },
  }
})

describe("segmentOf", () => {
  it("puts an offer with a document but no application among the ready ones, Like or not", () => {
    expect(segmentOf({ verdict: "LIKE", documents: true, application: false })).toBe("ready")
    expect(segmentOf({ verdict: null, documents: true, application: false })).toBe("ready")
  })

  it("lets applied and passed win over a document", () => {
    expect(segmentOf({ verdict: "APPLIED", documents: true, application: true })).toBe("applied")
    expect(segmentOf({ verdict: "DISLIKE", documents: true, application: false })).toBe("passed")
    expect(segmentOf({ verdict: "LIKE", documents: true, application: true })).toBe("applied")
  })

  it("keeps an offer with neither a verdict nor a document out of Zapisane", () => {
    expect(segmentOf({ verdict: null, documents: false, application: false })).toBeNull()
    expect(segmentOf({ verdict: "LIKE", documents: false, application: false })).toBe("liked")
  })
})

describe("listSaved", () => {
  it("counts every offer once, in the tab of its furthest step", async () => {
    const { counts } = await listSaved(1, "liked")

    expect(counts).toEqual({ liked: 1, ready: 2, applied: 1, passed: 1 })
  })

  it("lists ready offers newest document first, with the offer and its documents", async () => {
    const { offers } = await listSaved(1, "ready")

    expect(offers.map((offer) => offer.jobId)).toEqual(["j-ready", "j-letter"])
    expect(offers[0]).toMatchObject({
      title: "Staff Engineer",
      closed: true,
      verdict: "LIKE",
      cv: { id: "cv-ready", language: "en" },
      letter: null,
      applicationId: null,
    })
    expect(offers[1]).toMatchObject({
      title: "Platform Engineer",
      company: "Acme",
      verdict: null,
      cv: null,
      letter: { id: "letter-only" },
    })
  })

  it("links a sent offer to its application and the CV written for it", async () => {
    const { offers } = await listSaved(1, "applied")

    expect(offers).toHaveLength(1)
    expect(offers[0]).toMatchObject({
      jobId: "j-sent",
      applicationId: "app-sent",
      cv: { id: "cv-sent" },
    })
  })
})

describe("offerStages", () => {
  it("gives each offer with documents its tab, whether it closed and its application", async () => {
    const stages = await offerStages(1, ["j-ready", "j-letter", "j-sent", "j-gone"])

    expect(stages["j-ready"]).toEqual({ segment: "ready", closed: true, applicationId: null })
    expect(stages["j-letter"]).toEqual({ segment: "ready", closed: false, applicationId: null })
    expect(stages["j-sent"]).toEqual({
      segment: "applied",
      closed: false,
      applicationId: "app-sent",
    })
    expect(stages["j-gone"]).toMatchObject({ segment: "ready", closed: true })
  })
})
