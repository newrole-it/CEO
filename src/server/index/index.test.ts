import { describe, expect, it } from "vitest"
import type { SeedBoard } from "config/seed-boards"
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

  it("refreshes a complete board in a day and a capped career site on the next UTC day", () => {
    const now = new Date("2026-10-10T18:00:00.000Z")
    expect(nextCrawlAt(now, true, false).toISOString()).toBe("2026-10-11T18:00:00.000Z")
    expect(nextCrawlAt(now, false, false).toISOString()).toBe(now.toISOString())
    expect(nextCrawlAt(now, false, true).toISOString()).toBe("2026-10-11T00:15:00.000Z")
  })

  it("indexes allowed hosts and skips link-only hosts", () => {
    expect(boardIsIndexable(board("https://boards-api.greenhouse.io/v1/boards/acme/jobs"))).toBe(
      true
    )
    expect(boardIsIndexable(board("https://jobs.sap.com/search"))).toBe(false)
    expect(boardIsIndexable(board("https://sii.pl/sitemap.xml"))).toBe(true)
  })
})
