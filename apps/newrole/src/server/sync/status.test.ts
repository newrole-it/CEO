import { describe, expect, it } from "vitest"
import type { HarvestRun } from "src/server/harvest/format"
import { expectedNextRun } from "./status"

const now = new Date("2026-11-02T12:00:00.000Z")

function run(startedAt: string, everyMinutes: number | null = null): HarvestRun {
  return {
    startedAt,
    finishedAt: startedAt,
    agent: "claude",
    everyMinutes,
    due: 0,
    indexed: 0,
    failed: 0,
    deferred: 0,
    jobs: 0,
    hosts: [],
    errors: [],
  }
}

describe("expected cloud run", () => {
  it("uses the interval the prompt declares", () => {
    expect(expectedNextRun([run("2026-11-02T11:07:00.000Z", 120)], now)).toEqual({
      at: "2026-11-02T13:07:00.000Z",
      basis: "declared",
      minutes: 120,
      late: false,
    })
  })

  it("falls back to the median gap between runs, and needs two runs for it", () => {
    expect(expectedNextRun([run("2026-11-02T11:07:00.000Z")], now)).toBeNull()
    const runs = [
      run("2026-11-02T11:07:00.000Z"),
      run("2026-11-02T10:07:00.000Z"),
      run("2026-11-02T09:07:00.000Z"),
    ]
    expect(expectedNextRun(runs, now)).toMatchObject({
      at: "2026-11-02T12:07:00.000Z",
      basis: "observed",
      minutes: 60,
    })
  })

  it("calls a run late once a whole interval has passed after it was due", () => {
    expect(expectedNextRun([run("2026-11-02T08:00:00.000Z", 60)], now)?.late).toBe(true)
    expect(expectedNextRun([run("2026-11-02T10:30:00.000Z", 60)], now)?.late).toBe(false)
  })
})
