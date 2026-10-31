import { describe, expect, it } from "vitest"
import { ingestOfferUrl } from "src/server/discovery/ingest-offer"
import { readOffer, type ReadOfferDeps } from "./read-offer"
import type { IndexedJob } from "./service"

const indexed: IndexedJob = {
  id: "job_1",
  title: "QA Engineer",
  originalUrl: "https://acme.pl/kariera/qa",
  canonicalUrl: "https://acme.pl/kariera/qa",
  locationText: "Warszawa",
  salaryMin: 20000,
  salaryMax: 28000,
  salaryCurrency: "PLN",
  company: { name: "Acme" },
}

const noNetwork = {
  get: async () => {
    throw new Error("network must not be used")
  },
  post: async () => {
    throw new Error("network must not be used")
  },
}

/** Nothing in the index, and the real ingest path with a network that must stay unused. */
const offline: ReadOfferDeps = {
  findByUrl: async () => null,
  findById: async () => null,
  ingest: (url) => ingestOfferUrl({ url, channel: "web", forTracker: true }, { http: noNetwork }),
  model: async () => {
    throw new Error("model must not be used")
  },
}

const unparsed = (html: string): ReadOfferDeps => ({
  ...offline,
  ingest: async (url) => ({ status: "rejected", message: "no JSON-LD", page: { url, html } }),
})

describe("readOffer", () => {
  it("takes an indexed offer from the /apply page's link without fetching anything", async () => {
    const seen: string[] = []
    const reading = await readOffer("https://acme.pl/kariera/qa/apply", {
      ...offline,
      findByUrl: async (url) => {
        seen.push(url)
        return url === "https://acme.pl/kariera/qa" ? indexed : null
      },
    })
    expect(seen).toEqual(["https://acme.pl/kariera/qa/apply", "https://acme.pl/kariera/qa"])
    expect(reading).toEqual({
      url: "https://acme.pl/kariera/qa",
      outcome: "read",
      facts: {
        jobId: "job_1",
        company: "Acme",
        title: "QA Engineer",
        location: "Warszawa",
        salaryText: "20 000–28 000 PLN",
      },
    })
  })

  it("uses the offer the ingest path stored", async () => {
    const reading = await readOffer("https://jobs.lever.co/acme/1", {
      ...offline,
      ingest: async () => ({ status: "created", jobId: "job_1", message: "read" }),
      findById: async (id) => (id === "job_1" ? indexed : null),
    })
    expect(reading.outcome).toBe("read")
    expect(reading.facts?.jobId).toBe("job_1")
  })

  it("never fetches LinkedIn or a job board, and marks what the link says for checking", async () => {
    const board = await readOffer(
      "https://justjoin.it/job-offer/jit-team-senior-java-developer-warszawa-java",
      offline
    )
    expect(board.outcome).toBe("link-only")
    expect(board.facts).toEqual({
      jobId: null,
      company: "Jit Team",
      title: "Senior Java Developer",
      location: "Warszawa",
      salaryText: null,
    })
    const linkedin = await readOffer(
      "https://www.linkedin.com/jobs/view/qa-engineer-at-acme-123456",
      offline
    )
    expect(linkedin.outcome).toBe("link-only")
    expect(linkedin.facts).toMatchObject({ company: "Acme", title: "Qa Engineer" })
    const bare = await readOffer("https://www.linkedin.com/jobs/view/123456", offline)
    expect(bare.outcome).toBe("link-only")
    expect(bare.facts).toBeNull()
  })

  it("keeps the company an ATS link names when the board cannot be read", async () => {
    const reading = await readOffer("https://jobs.lever.co/acme/1", {
      ...offline,
      ingest: async () => ({
        status: "rejected",
        message: "That offer is no longer on the board.",
      }),
    })
    expect(reading.outcome).toBe("unreadable")
    expect(reading.facts?.company).toBe("Acme")
  })

  it("lets the model read a page without structured data, salary included", async () => {
    const reading = await readOffer("https://acme.pl/kariera/qa", {
      ...unparsed("<title>Praca - Acme</title><p>QA Engineer. 20 000 PLN</p>"),
      model: async (page) => {
        expect(page.text).toContain("QA Engineer")
        return {
          company: "Acme S.A.",
          title: "QA Engineer",
          location: "Warszawa",
          salaryText: "20 000 PLN",
        }
      },
    })
    expect(reading.outcome).toBe("read")
    expect(reading.facts).toEqual({
      jobId: null,
      company: "Acme S.A.",
      title: "QA Engineer",
      location: "Warszawa",
      salaryText: "20 000 PLN",
    })
  })

  it("hides a recruiter's contact from the model but not the pay", async () => {
    let seen = ""
    await readOffer("https://acme.pl/kariera/qa", {
      ...unparsed("<p>Pensja: 22 000 - 30 000 PLN</p><p>anna@acme.pl, +48 600 100 200</p>"),
      model: async (page) => {
        seen = page.text ?? ""
        return null
      },
    })
    expect(seen).toContain("22 000 - 30 000 PLN")
    expect(seen).not.toMatch(/anna@|600 100/)
  })

  it("asks for a check when only the page title was there to go on", async () => {
    const reading = await readOffer("https://acme.pl/kariera/qa", {
      ...unparsed("<title>QA Engineer - Acme</title>"),
      model: async () => null,
    })
    expect(reading.outcome).toBe("partial")
    expect(reading.facts).toMatchObject({ company: "Acme", title: "QA Engineer" })
  })

  it("does not send a page that opts out of AI use to the model", async () => {
    const reading = await readOffer("https://acme.pl/kariera/qa", {
      ...unparsed('<title>QA Engineer - Acme</title><meta name="x" content="ai-input=no">'),
    })
    expect(reading.outcome).toBe("partial")
  })

  it("does not take a section title for a role", async () => {
    const reading = await readOffer("https://careers.acme.pl/oferta/1", {
      ...unparsed("<title>Kariera</title>"),
      model: async () => null,
    })
    expect(reading.outcome).toBe("partial")
    expect(reading.facts).toMatchObject({ company: "Acme", title: null })
  })
})
