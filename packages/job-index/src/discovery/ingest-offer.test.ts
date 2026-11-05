import { describe, expect, it } from "vitest"
import type { ListedJob } from "@newrole/ats/schemas"
import { ingestOfferUrl, matchPosting, payloadToJob } from "./ingest-offer"

const base = {
  url: "https://acme.pl/kariera/backend",
  company: "Acme",
  title: "Backend Engineer",
  channel: "mcp" as const,
}

describe("payloadToJob", () => {
  it("validates, cleans, and strips recruiter contact data", () => {
    const result = payloadToJob({
      ...base,
      title: "  Backend\u0007 Engineer  ",
      description:
        "<p>Kotlin, Kafka.</p><p>Recruiter: Anna Nowak, anna.nowak@acme.pl, +48 600 100 200</p>",
      location: "Warszawa",
      workplace: "HYBRID",
      salaryMin: 20000,
      salaryMax: 28000,
      salaryCurrency: "pln",
    })
    expect("job" in result).toBe(true)
    if (!("job" in result)) return
    expect(result.linkOnly).toBe(false)
    expect(result.job.title).toBe("Backend Engineer")
    expect(result.job.sourceType).toBe("WEB_SEARCH")
    expect(result.job.sourceBoardId).toBe("mcp:acme.pl:acme")
    expect(result.job.salaryCurrency).toBe("PLN")
    expect(result.job.workplaceType).toBe("HYBRID")
    expect(result.job.descriptionText).toContain("Kotlin")
    expect(result.job.descriptionText).not.toMatch(/anna\.nowak|600 100 200|Anna Nowak/)
  })

  it("rejects bad input with a reason", () => {
    expect(payloadToJob({ ...base, url: "ftp://acme.pl/x" })).toHaveProperty("error")
    expect(payloadToJob({ ...base, url: "http://127.0.0.1/job" })).toHaveProperty("error")
    expect(payloadToJob({ ...base, title: "" })).toHaveProperty("error")
    expect(payloadToJob({ ...base, salaryMin: 30000, salaryMax: 10000 })).toHaveProperty("error")
    expect(payloadToJob({ ...base, salaryMin: -5 })).toHaveProperty("error")
    expect(payloadToJob({ ...base, salaryCurrency: "zloty" })).toHaveProperty("error")
    expect(payloadToJob({ ...base, channel: "extension" })).toHaveProperty("error")
    const linkedin = payloadToJob({ ...base, url: "https://www.linkedin.com/jobs/view/1" })
    expect(linkedin).toHaveProperty("error")
  })

  it("keeps a job-board offer as title and link only", () => {
    const result = payloadToJob({
      ...base,
      url: "https://justjoin.it/job-offer/acme-backend",
      description: "Full text copied from the board",
      salaryMin: 20000,
      salaryMax: 25000,
      salaryCurrency: "PLN",
    })
    expect("job" in result && result.linkOnly).toBe(true)
    if ("job" in result) {
      expect(result.job.descriptionText).toBeUndefined()
      expect(result.job.salaryMin).toBe(20000)
    }
  })

  it("keeps hourly currency tags", () => {
    const result = payloadToJob({
      ...base,
      salaryMin: 150,
      salaryMax: 200,
      salaryCurrency: "PLN/HOUR",
    })
    expect("job" in result && result.job.salaryCurrency).toBe("PLN/hour")
  })

  it("marks an offer the person added by hand and reads its pay as written", () => {
    const result = payloadToJob({
      ...base,
      url: "https://www.google.com/about/careers/applications/jobs/results/1-manager",
      company: "Google",
      channel: "web",
      salaryText: "zł640000 - zł655000 (PLN)",
    })
    expect("job" in result).toBe(true)
    if (!("job" in result)) return
    expect(result.job.sourceBoardId).toBe("web:google.com:google")
    expect(result.job).toMatchObject({
      salaryMin: 640000,
      salaryMax: 655000,
      salaryCurrency: "PLN",
    })
  })

  it("prefers stated pay numbers to the pay text", () => {
    const result = payloadToJob({
      ...base,
      salaryMin: 20000,
      salaryMax: 25000,
      salaryCurrency: "PLN",
      salaryText: "30 000 EUR",
    })
    expect("job" in result && result.job).toMatchObject({ salaryMin: 20000, salaryCurrency: "PLN" })
  })
})

describe("matchPosting", () => {
  const job = (url: string, externalId?: string): ListedJob =>
    ({
      title: "T",
      originalUrl: url,
      externalId,
      sourceType: "GREENHOUSE",
      needsHydration: false,
    } as ListedJob)
  it("matches by canonical URL, then id in path, then a single posting", () => {
    const jobs = [job("https://x.io/jobs/1", "11111"), job("https://x.io/jobs/2", "22222")]
    expect(matchPosting(jobs, "https://x.io/jobs/2?utm_source=x")?.externalId).toBe("22222")
    expect(matchPosting(jobs, "https://other.io/apply/11111")?.externalId).toBe("11111")
    expect(matchPosting(jobs, "https://other.io/nothing")).toBeNull()
    expect(matchPosting([jobs[0]!], "https://other.io/nothing")?.externalId).toBe("11111")
  })
})

describe("matchPosting, exact", () => {
  it("does not take a board's only offer for the one in the link", () => {
    const job = { title: "T", originalUrl: "https://x.io/jobs/1", externalId: "11111" } as ListedJob
    expect(matchPosting([job], "https://x.io/jobs/2", true)).toBeNull()
    expect(matchPosting([job], "https://x.io/jobs/1", true)).toBe(job)
  })
})

describe("ingestOfferUrl", () => {
  const http = {
    get: async () => {
      throw new Error("network must not be used")
    },
    post: async () => {
      throw new Error("network must not be used")
    },
  }
  it("refuses LinkedIn and keeps Polish boards link-only without fetching", async () => {
    const linkedin = await ingestOfferUrl(
      { url: "https://www.linkedin.com/jobs/view/1", channel: "mcp" },
      { http }
    )
    expect(linkedin.status).toBe("rejected")
    const board = await ingestOfferUrl(
      { url: "https://nofluffjobs.com/pl/job/acme", channel: "mcp" },
      { http }
    )
    expect(board.status).toBe("link-only")
    const workday = await ingestOfferUrl(
      { url: "https://acme.wd3.myworkdayjobs.com/Acme/job/Warsaw/Dev_1", channel: "mcp" },
      { http }
    )
    expect(workday.status).toBe("link-only")
  })

  it("stores JSON-LD from an allowed company page", async () => {
    const posting = {
      "@type": "JobPosting",
      title: "QA Engineer",
      hiringOrganization: { name: "Acme" },
      url: "https://acme.pl/kariera/qa",
    }
    const saved: ListedJob[] = []
    const result = await ingestOfferUrl(
      { url: "https://acme.pl/kariera/qa", channel: "mcp" },
      {
        http: {
          get: async (url: string) => ({
            url,
            status: url.endsWith("robots.txt") ? 404 : 200,
            body: `<script type="application/ld+json">${JSON.stringify(posting)}</script>`,
            contentType: "text/html",
          }),
          post: http.post,
        },
        takeSlot: async () => true,
        existing: async () => null,
        save: async (job) => {
          saved.push(job)
          return { id: "job_1" }
        },
      }
    )
    expect(result).toMatchObject({ status: "created", jobId: "job_1" })
    expect(saved[0]).toMatchObject({
      title: "QA Engineer",
      companyName: "Acme",
      sourceBoardId: "page:acme.pl:acme",
    })
  })

  it("hands back a page without a posting only for the tracker", async () => {
    const page = {
      http: {
        get: async (url: string) => ({
          url,
          status: url.endsWith("robots.txt") ? 404 : 200,
          body: "<html><title>QA Engineer - Acme</title></html>",
          contentType: "text/html",
        }),
        post: http.post,
      },
      takeSlot: async () => true,
    }
    const url = "https://acme.pl/kariera/qa"
    const plain = await ingestOfferUrl({ url, channel: "mcp" }, page)
    expect(plain.status).toBe("rejected")
    expect(plain.page).toBeUndefined()
    const tracker = await ingestOfferUrl({ url, channel: "web", forTracker: true }, page)
    expect(tracker.status).toBe("rejected")
    expect(tracker.page?.html).toContain("QA Engineer")
  })
})
