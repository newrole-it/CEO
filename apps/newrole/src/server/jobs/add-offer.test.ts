import { describe, expect, it } from "vitest"
import type { ReadOfferDeps } from "src/server/applications/read-offer"
import type { IndexedJob } from "src/server/applications/service"
import { addOffer, offerLink, readNewOffer } from "./add-offer"

const GOOGLE =
  "https://www.google.com/about/careers/applications/jobs/results/136305128868061894-senior-software-engineering-manager-emergent-ai-infrastructure"

const indexed: IndexedJob = {
  id: "job_1",
  title: "QA Engineer",
  originalUrl: "https://acme.pl/kariera/qa",
  canonicalUrl: "https://acme.pl/kariera/qa",
  locationText: "Warszawa",
  salaryMin: null,
  salaryMax: null,
  salaryCurrency: null,
  company: { name: "Acme" },
}

/** Nothing in the index, and nothing may be fetched or sent to the model. */
const offline: ReadOfferDeps = {
  findByUrl: async () => null,
  findById: async () => null,
  ingest: async () => {
    throw new Error("ingest must not be used")
  },
  model: async () => {
    throw new Error("model must not be used")
  },
}

describe("offerLink", () => {
  it("takes a link with or without https://", () => {
    expect(offerLink("  https://acme.pl/kariera/qa ")).toBe("https://acme.pl/kariera/qa")
    expect(offerLink("www.acme.pl/kariera/qa")).toBe("https://www.acme.pl/kariera/qa")
  })

  it("refuses what is not a web link", () => {
    expect(offerLink("")).toBeNull()
    expect(offerLink("Senior QA w Acme")).toBeNull()
    expect(offerLink("ftp://acme.pl/qa")).toBeNull()
  })
})

describe("readNewOffer", () => {
  it("refuses LinkedIn before reading anything", async () => {
    expect(await readNewOffer("https://www.linkedin.com/jobs/view/1", offline)).toEqual({
      kind: "refused",
    })
    expect(await readNewOffer("no link here", offline)).toEqual({ kind: "invalid" })
  })

  it("finds an offer the index has, also behind the Google sign-in link", async () => {
    const seen: string[] = []
    const check = await readNewOffer(GOOGLE.replace("/jobs/results/", "/jobs/recommendations/"), {
      ...offline,
      findByUrl: async (url) => {
        seen.push(url)
        return url === GOOGLE ? indexed : null
      },
    })
    expect(seen).toContain(GOOGLE)
    expect(check).toEqual({
      kind: "indexed",
      jobId: "job_1",
      company: "Acme",
      title: "QA Engineer",
      added: false,
    })
  })

  it("says when the ATS path stored the offer just now", async () => {
    const check = await readNewOffer("https://jobs.lever.co/acme/uuid", {
      ...offline,
      ingest: async () => ({ status: "created", jobId: "job_1", message: "read from lever" }),
      findById: async (id) => (id === "job_1" ? indexed : null),
    })
    expect(check).toMatchObject({ kind: "indexed", jobId: "job_1", added: true })
  })

  it("hands a page without structured data back to be checked", async () => {
    const check = await readNewOffer(GOOGLE, {
      ...offline,
      ingest: async (url) => ({
        status: "rejected",
        message: "no JSON-LD",
        page: { url, html: "<title>Senior Software Engineering Manager — Google Careers</title>" },
      }),
      model: async () => ({
        company: "Google",
        title: "Senior Software Engineering Manager, Emergent AI Infrastructure",
        location: "Warsaw, Poland",
        salaryText: "zł640000 - zł655000 (PLN)",
      }),
    })
    expect(check).toEqual({
      kind: "draft",
      url: GOOGLE,
      outcome: "read",
      facts: {
        jobId: null,
        company: "Google",
        title: "Senior Software Engineering Manager, Emergent AI Infrastructure",
        location: "Warsaw, Poland",
        salaryText: "zł640000 - zł655000 (PLN)",
      },
    })
  })
})

describe("addOffer", () => {
  it("stores what the person checked as their own offer", async () => {
    let sent: unknown = null
    const result = await addOffer(
      {
        url: "www.acme.pl/kariera/qa",
        company: "Acme",
        title: "QA Engineer",
        location: "  ",
        salaryText: "20 000 - 25 000 PLN",
      },
      async (input) => {
        sent = input
        return { status: "created", jobId: "job_2", message: "stored" }
      }
    )
    expect(result).toEqual({ jobId: "job_2", created: true })
    expect(sent).toEqual({
      url: "https://www.acme.pl/kariera/qa",
      company: "Acme",
      title: "QA Engineer",
      location: undefined,
      workplace: undefined,
      salaryText: "20 000 - 25 000 PLN",
      channel: "web",
    })
  })

  it("passes the reason on when the offer is refused", async () => {
    const result = await addOffer(
      { url: "https://acme.pl/qa", company: "A", title: "QA" },
      async () => ({
        status: "rejected",
        message: "company: Company is required",
      })
    )
    expect(result).toEqual({ error: "company: Company is required" })
  })
})
