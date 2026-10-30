import { describe, expect, it } from "vitest"
import { INDEXING_NOTE } from "./store"
import { apiPaceMs, buildCrawlSnapshot, type ProgressBoard } from "./progress"

const now = new Date("2026-10-16T20:00:00.000Z")

function board(partial: Partial<ProgressBoard> & Pick<ProgressBoard, "company">): ProgressBoard {
  return {
    provider: "GREENHOUSE",
    boardId: partial.company.toLowerCase(),
    lastSuccessfulFetchAt: null,
    lastCheckedAt: null,
    nextCheckAt: null,
    indexComplete: false,
    lastErrorCode: null,
    fetchNote: null,
    jobs: 0,
    ...partial,
  }
}

describe("crawl progress", () => {
  it("estimates the remaining API boards from the recent pace and ignores a long pause", () => {
    const boards = [0, 1, 2, 3, 4].map((index) =>
      board({
        company: `Api ${index}`,
        lastSuccessfulFetchAt: new Date(now.getTime() - (5 - index) * 8_000),
        indexComplete: true,
        jobs: 10,
      })
    )
    boards.push(
      board({
        company: "Earlier",
        lastSuccessfulFetchAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        indexComplete: true,
      })
    )
    boards.push(board({ company: "Waiting" }), board({ company: "Also waiting" }))
    const snapshot = buildCrawlSnapshot({ now, boards, activeSearches: 0 })
    expect(snapshot.apiTotal).toBe(8)
    expect(snapshot.apiFetched).toBe(6)
    expect(snapshot.apiRemaining).toBe(2)
    expect(snapshot.paceSeconds).toBe(8)
    expect(snapshot.etaSeconds).toBe(16)
    expect(snapshot.phase).toBe("working")
    expect(apiPaceMs(boards, now)).toBe(8000)
  })

  it("shows the company being read, and drops that marker once it is stale", () => {
    const live = buildCrawlSnapshot({
      now,
      activeSearches: 0,
      boards: [
        board({
          company: "Sii",
          provider: "CAREER_SITE",
          fetchNote: INDEXING_NOTE,
          lastCheckedAt: new Date(now.getTime() - 20_000),
        }),
        board({
          company: "GitLab",
          lastSuccessfulFetchAt: new Date(now.getTime() - 40_000),
          indexComplete: true,
          jobs: 4,
        }),
      ],
    })
    expect(live.phase).toBe("reading")
    expect(live.current).toEqual([{ company: "Sii", provider: "CAREER_SITE", slow: true }])
    expect(live.careerRemaining).toBe(1)
    expect(live.apiRemaining).toBe(0)

    const stale = buildCrawlSnapshot({
      now,
      activeSearches: 0,
      boards: [
        board({
          company: "Sii",
          provider: "CAREER_SITE",
          fetchNote: INDEXING_NOTE,
          lastCheckedAt: new Date(now.getTime() - 10 * 60 * 1000),
        }),
      ],
    })
    expect(stale.current).toEqual([])
    expect(stale.phase).toBe("idle")
  })

  it("says the crawl is paused while a search is queued and nothing was just stored", () => {
    const snapshot = buildCrawlSnapshot({
      now,
      activeSearches: 1,
      boards: [
        board({
          company: "GitLab",
          lastSuccessfulFetchAt: new Date(now.getTime() - 5 * 60 * 1000),
          indexComplete: true,
        }),
        board({ company: "Waiting" }),
      ],
    })
    expect(snapshot.phase).toBe("paused")
  })

  it("counts a capped career site as continuing tomorrow", () => {
    const snapshot = buildCrawlSnapshot({
      now,
      activeSearches: 0,
      boards: [
        board({
          company: "Allegro",
          provider: "SUCCESSFACTORS",
          lastSuccessfulFetchAt: new Date(now.getTime() - 60_000),
          indexComplete: false,
          nextCheckAt: new Date(now.getTime() + 60 * 60 * 1000),
          jobs: 30,
        }),
      ],
    })
    expect(snapshot.continuesTomorrow).toBe(1)
    expect(snapshot.phase).toBe("working")
    expect(snapshot.recent[0]?.complete).toBe(false)
  })
})
