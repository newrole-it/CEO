import { describe, expect, it } from "vitest"
import { pickWatchedPage } from "../index/schedule"
import { actionForHit, buildHuntQueries, queriesFor, type HuntTarget } from "./hidden-offers"

const acme: HuntTarget = { userId: 2, companyId: "c1", name: "Acme", domain: "acme.pl" }
const nodomain: HuntTarget = { userId: 2, companyId: "c2", name: "Beta Soft", domain: null }

describe("hunt queries", () => {
  it("asks for the careers page first, then ATS hosts, then roles", () => {
    const queries = queriesFor(acme, ["Engineering Manager"])
    expect(queries[0]).toBe("site:acme.pl kariera OR careers OR jobs")
    expect(queries[1]).toContain('"Acme" (site:teamtailor.com')
    expect(queries[2]).toBe("site:acme.pl Engineering Manager")
    expect(queriesFor(nodomain, ["QA"])[0]).toBe('"Beta Soft" kariera OR careers')
    expect(queriesFor(nodomain, ["QA"])[2]).toBe('"QA" "Beta Soft"')
  })

  it("spreads a small cap round-robin over companies", () => {
    const picked = buildHuntQueries([acme, nodomain], ["QA"], 3)
    expect(picked.map((item) => item.target.companyId)).toEqual(["c1", "c2", "c1"])
    expect(buildHuntQueries([], ["QA"], 5)).toEqual([])
  })
})

describe("actionForHit", () => {
  it("watches agreeing ATS boards and careers pages, ingests job pages, skips the rest", () => {
    expect(actionForHit({ url: "https://acme.teamtailor.com/jobs" }, acme)).toEqual({
      kind: "watch",
      url: "https://acme.teamtailor.com/jobs",
    })
    expect(actionForHit({ url: "https://other.teamtailor.com/jobs" }, acme).kind).toBe("skip")
    expect(actionForHit({ url: "https://acme.pl/kariera/senior-qa" }, acme).kind).toBe("ingest")
    expect(actionForHit({ url: "https://kariera.acme.pl/" }, acme).kind).toBe("skip")
    expect(actionForHit({ url: "https://acme.pl/kariera" }, acme).kind).toBe("watch")
    expect(actionForHit({ url: "https://justjoin.it/job-offer/acme" }, acme).kind).toBe("skip")
    expect(actionForHit({ url: "https://www.linkedin.com/jobs/view/1" }, acme).kind).toBe("skip")
    expect(actionForHit({ url: "https://news.pl/acme-hiring" }, acme).kind).toBe("skip")
  })
})

describe("pickWatchedPage", () => {
  const now = new Date("2026-10-28T12:00:00Z")
  it("prefers never-read pages, then more watchers, and skips pages not due", () => {
    const pages = [
      {
        id: "later",
        nextCheckAt: new Date("2026-10-29T00:00:00Z"),
        lastSuccessfulFetchAt: null,
        watchers: 9,
      },
      {
        id: "read",
        nextCheckAt: new Date("2026-10-28T10:00:00Z"),
        lastSuccessfulFetchAt: now,
        watchers: 5,
      },
      { id: "new-1", nextCheckAt: null, lastSuccessfulFetchAt: null, watchers: 1 },
      { id: "new-2", nextCheckAt: null, lastSuccessfulFetchAt: null, watchers: 3 },
    ]
    expect(pickWatchedPage(pages, now)?.id).toBe("new-2")
    expect(pickWatchedPage(pages.slice(0, 2), now)?.id).toBe("read")
    expect(pickWatchedPage(pages.slice(0, 1), now)).toBeNull()
  })
})
