import { describe, expect, it } from "vitest"
import { INDEXING_NOTE } from "./store"
import {
  apiPaceMs,
  buildCrawlSnapshot,
  buildFetchProgress,
  type FetchBoard,
  type ProgressBoard,
} from "./progress"

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

describe("fetch progress on the companies page", () => {
  const seen = new Date(now.getTime() - 20_000)
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000)

  function fetchBoard(partial: Partial<FetchBoard> & Pick<FetchBoard, "company">): FetchBoard {
    return {
      lastSuccessfulFetchAt: null,
      lastCheckedAt: null,
      nextCheckAt: null,
      indexComplete: false,
      lastErrorCode: null,
      fetchNote: null,
      watchedCompanyId: null,
      ...partial,
    }
  }

  const ready = (company: string, extra: Partial<FetchBoard> = {}) =>
    fetchBoard({
      company,
      lastSuccessfulFetchAt: new Date(now.getTime() - 60_000),
      lastCheckedAt: new Date(now.getTime() - 60_000),
      nextCheckAt: later(60),
      indexComplete: true,
      ...extra,
    })

  const build = (boards: FetchBoard[], activeSearches = 0, workerSeenAt: Date | null = seen) =>
    buildFetchProgress({ now, boards, activeSearches, workerSeenAt })

  it("says all offers are fetched only when every board is complete", () => {
    const progress = build([ready("A", { nextCheckAt: later(90) }), ready("B", { nextCheckAt: later(30) })])
    expect(progress).toMatchObject({ phase: "done", ready: 2, total: 2, percent: 100, waiting: 0 })
    expect(progress.nextCheckAt).toBe(later(30).toISOString())
  })

  it("reports gaps, not done, when a board failed or stopped at the daily cap", () => {
    const failed = build([
      ready("A"),
      fetchBoard({ company: "Broken", nextCheckAt: later(15), lastErrorCode: "TEMPORARY_ERROR" }),
    ])
    expect(failed).toMatchObject({ phase: "gaps", ready: 1, percent: 50 })
    expect(failed.failed).toEqual({ count: 1, names: ["Broken"] })

    const capped = build([ready("Large", { indexComplete: false })])
    expect(capped).toMatchObject({ phase: "gaps", ready: 0, percent: 0 })
    expect(capped.partial).toEqual({ count: 1, names: ["Large"] })
  })

  it("shows the board being read and counts the ones still due", () => {
    const progress = build([
      ready("A"),
      fetchBoard({ company: "Reading", fetchNote: INDEXING_NOTE, lastCheckedAt: new Date(now.getTime() - 5_000) }),
      fetchBoard({ company: "Never read" }),
      ready("Refresh due", { nextCheckAt: new Date(now.getTime() - 1_000) }),
    ])
    expect(progress).toMatchObject({ phase: "reading", current: "Reading", waiting: 2, ready: 1, percent: 25 })
  })

  it("treats a failed board as queued once its retry is due", () => {
    const progress = build([
      fetchBoard({
        company: "Retry",
        nextCheckAt: new Date(now.getTime() - 1_000),
        lastErrorCode: "TEMPORARY_ERROR",
      }),
    ])
    expect(progress).toMatchObject({ phase: "queued", waiting: 1 })
    expect(progress.failed.count).toBe(0)
  })

  it("says a search holds the queue, but only while something is waiting", () => {
    expect(build([ready("A"), fetchBoard({ company: "Waiting" })], 1).phase).toBe("paused")
    expect(build([ready("A")], 1).phase).toBe("done")
  })

  it("reports a stopped worker whatever the boards last said", () => {
    const old = new Date(now.getTime() - 5 * 60 * 1000)
    expect(build([ready("A")], 0, old).phase).toBe("stopped")
    expect(build([ready("A")], 0, null).phase).toBe("stopped")
    const midRead = fetchBoard({
      company: "Reading",
      fetchNote: INDEXING_NOTE,
      lastCheckedAt: new Date(now.getTime() - 5_000),
    })
    expect(build([midRead], 0, old).phase).toBe("stopped")
  })

  it("never rounds up to 100% while a board is missing", () => {
    const boards = Array.from({ length: 999 }, (_, index) => ready(`A${index}`))
    boards.push(fetchBoard({ company: "Last one" }))
    expect(build(boards).percent).toBe(99)
  })

  it("counts a watched company as ready only when all its boards are", () => {
    const progress = build([
      ready("One", { watchedCompanyId: "one" }),
      ready("Two", { watchedCompanyId: "two" }),
      fetchBoard({ company: "Two", watchedCompanyId: "two" }),
      ready("Not mine"),
    ])
    expect(progress.watched).toEqual({ total: 2, ready: 1 })
  })

  it("lists the person's own companies first and caps the names, not the count", () => {
    const failing = Array.from({ length: 20 }, (_, index) =>
      fetchBoard({ company: `Co ${index}`, nextCheckAt: later(15), lastErrorCode: "TEMPORARY_ERROR" })
    )
    failing.push(
      fetchBoard({
        company: "Mine",
        nextCheckAt: later(15),
        lastErrorCode: "TEMPORARY_ERROR",
        watchedCompanyId: "mine",
      })
    )
    const { failed } = build(failing)
    expect(failed.count).toBe(21)
    expect(failed.names).toHaveLength(12)
    expect(failed.names[0]).toBe("Mine")
  })

  it("keeps the newest fetch time when many boards are in", () => {
    const newest = new Date(now.getTime() - 5_000)
    const progress = build([
      ready("A"),
      ready("B", { lastSuccessfulFetchAt: newest }),
      ready("C"),
    ])
    expect(progress.lastFetchedAt).toBe(newest.toISOString())
  })
})
