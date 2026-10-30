import { describe, expect, it } from "vitest"
import type { SeedBoard } from "config/seed-boards"
import { careerListUsesCache, listCareerSite } from "src/server/adapters/career-site"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
import { UnsafeUrlError } from "src/server/security/url-safety"
import { conditionalHttp } from "./conditional"
import { identityFor } from "./store"
import { boardIsIndexable } from "./run"
import { nextCrawlAt, nextStatus } from "./schedule"

const board = (apiUrl: string): SeedBoard => ({
  provider: "CAREER_SITE",
  boardId: "example",
  companyName: "Example",
  careersUrl: apiUrl,
  apiUrl,
  openJobsAtCheck: 1,
  plLocatedJobs: 1,
  identityConfirmed: true,
  priority: 1,
})

describe("index schedule", () => {
  it("steps a missing job from active to closed, and reopens it when it returns", () => {
    expect(nextStatus("ACTIVE", false)).toBe("POSSIBLY_CLOSED")
    expect(nextStatus("POSSIBLY_CLOSED", false)).toBe("CLOSED")
    expect(nextStatus("CLOSED", false)).toBeNull()
    expect(nextStatus("POSSIBLY_CLOSED", true)).toBe("ACTIVE")
    expect(nextStatus("ACTIVE", true)).toBeNull()
  })

  it("refreshes a complete board in a day and keeps an unfinished board ahead of the queue", () => {
    const now = new Date("2026-10-10T18:00:00.000Z")
    expect(nextCrawlAt(now, true, false).toISOString()).toBe("2026-10-11T18:00:00.000Z")
    expect(nextCrawlAt(now, false, false).toISOString()).toBe("1970-01-01T00:00:00.000Z")
    expect(nextCrawlAt(now, false, true).toISOString()).toBe("2026-10-11T00:15:00.000Z")
    // An unfinished board that read nothing waits instead of holding the front of the queue.
    expect(nextCrawlAt(now, false, false, false).getTime()).toBe(now.getTime() + 6 * 3600_000)
  })

  it("keeps each Sii offer when JSON-LD names the employer as the identifier", () => {
    const html = `<script type="application/ld+json">{"@type":"JobPosting","title":"Business Analyst",
      "identifier":{"@type":"PropertyValue","name":"Sii Polska","value":"230601-EYNQW"},
      "hiringOrganization":{"name":"Sii Polska"},
      "url":"https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/"}</script>`
    const [job] = parseJsonLdJobs(
      html,
      "https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x/",
      "Sii Polska",
      {
        sourceType: "CAREER_SITE",
        boardId: "sii.pl",
      }
    )
    expect(job.externalId).toBe("230601-EYNQW")
    expect(identityFor(job)).toBe("company_site:230601-EYNQW")
    expect(identityFor({ ...job, externalId: "Sii Polska", companyName: "Sii Polska" })).toBe(
      "url:https://sii.pl/oferty-pracy/id/30518/business-analyst-f-m-x"
    )
  })

  it("does not send a sitemap validator on robots.txt or a job page", async () => {
    const seen = new Map<string, string | undefined>()
    const { client } = conditionalHttp(
      {
        async post() {
          throw new Error("post is unused")
        },
        async get(url, opts) {
          seen.set(url, opts?.headers?.["If-None-Match"])
          return {
            url,
            status: 200,
            body: "",
            contentType: "text/plain",
            headers: { etag: url.includes("sitemap") ? "sitemap-etag" : "other-etag" },
          }
        },
      },
      { etag: "stored-etag" }
    )
    await client.get("https://careers.epam.com/robots.txt")
    await client.get("https://careers.epam.com/sitemap.xml.gz")
    await client.get("https://careers.epam.com/en/vacancy/role")
    expect(seen.get("https://careers.epam.com/robots.txt")).toBeUndefined()
    expect(seen.get("https://careers.epam.com/sitemap.xml.gz")).toBe("stored-etag")
    expect(seen.get("https://careers.epam.com/en/vacancy/role")).toBeUndefined()
  })

  it("does not treat a failed sitemap as an empty catalog", async () => {
    const listed = await listCareerSite(
      "careers.epam.com",
      {
        async post() {
          throw new Error("post is unused")
        },
        async get(url) {
          if (url.endsWith("/robots.txt")) {
            return {
              url,
              status: 200,
              body: "User-agent: *\nAllow: /\nSitemap: https://careers.epam.com/sitemap.xml.gz\n",
              contentType: "text/plain",
            }
          }
          if (url.includes("sitemap")) throw new UnsafeUrlError("Redirect missing location")
          return { url, status: 404, body: "", contentType: "text/plain" }
        },
      },
      "EPAM",
      { detailBudget: 5, knownUrls: new Set() }
    )
    expect(listed.proven).toBe(false)
    expect(listed.complete).toBe(false)
    expect(listed.jobs).toEqual([])
    expect(listed.note).toMatch(/Redirect missing location/)
  })

  it("does not serve a stored listing when the indexer is backfilling", () => {
    expect(careerListUsesCache(undefined)).toBe(true)
    expect(careerListUsesCache({})).toBe(true)
    expect(careerListUsesCache({ detailBudget: 30 })).toBe(false)
    expect(careerListUsesCache({ knownUrls: new Set() })).toBe(false)
  })

  it("indexes allowed hosts and skips link-only hosts", () => {
    expect(boardIsIndexable(board("https://boards-api.greenhouse.io/v1/boards/acme/jobs"))).toBe(
      true
    )
    expect(boardIsIndexable(board("https://jobs.sap.com/search"))).toBe(false)
    expect(boardIsIndexable(board("https://sii.pl/sitemap.xml"))).toBe(true)
  })
})
