import { describe, expect, it } from "vitest"
import type { SeedBoard } from "config/seed-boards"
import { careerListUsesCache } from "src/server/adapters/career-site"
import { parseJsonLdJobs } from "src/server/adapters/jsonld"
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
