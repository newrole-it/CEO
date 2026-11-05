import { describe, expect, it } from "vitest"
import type { SeedBoard } from "../config/seed-boards"
import { boardHosts, dueBoards, harvestableBoards, mergeRun } from "./collect"
import {
  boardKey,
  boardPath,
  emptyManifest,
  isHarvestBranch,
  parseBoard,
  parseManifest,
  serializeBoard,
  sha256,
} from "./format"
import { newestReads } from "./import"

const now = new Date("2026-11-02T12:00:00.000Z")

function seed(provider: SeedBoard["provider"], boardId: string, apiUrl: string): SeedBoard {
  return {
    provider,
    boardId,
    companyName: boardId,
    careersUrl: apiUrl,
    apiUrl,
    openJobsAtCheck: 1,
    plLocatedJobs: 0,
    identityConfirmed: true,
    priority: 1,
  }
}

const acme = seed("GREENHOUSE", "acme", "https://boards-api.greenhouse.io/v1/boards/acme/jobs")
const beta = seed("LEVER", "beta", "https://api.lever.co/v0/postings/beta?mode=json")
const site = seed("CAREER_SITE", "site.example", "https://site.example/sitemap.xml")

const job = {
  title: "Staff Engineer",
  companyName: "acme",
  originalUrl: "https://job-boards.greenhouse.io/acme/jobs/1",
  sourceType: "GREENHOUSE" as const,
  sourceBoardId: "acme",
  workplaceType: "REMOTE" as const,
  needsHydration: false,
  descriptionText: `Write to jan.kowalski@example.com ${"x".repeat(2000)}`,
  publishedAt: new Date("2026-10-30T08:00:00.000Z"),
}

describe("harvest format", () => {
  it("names only branches that end in newrole-harvest", () => {
    expect(isHarvestBranch("claude/newrole-harvest")).toBe(true)
    expect(isHarvestBranch("newrole-harvest")).toBe(true)
    expect(isHarvestBranch("claude/newrole-harvest-old")).toBe(false)
    expect(isHarvestBranch("main")).toBe(false)
  })

  it("keeps the excerpt the index keeps and reads the dates back", () => {
    const text = serializeBoard({ jobs: [job], proven: true, complete: true })
    expect(text).not.toContain("jan.kowalski@example.com")
    expect(text.length).toBeLessThan(1500)
    const back = parseBoard(text, "GREENHOUSE")
    expect(back?.jobs[0].publishedAt?.toISOString()).toBe("2026-10-30T08:00:00.000Z")
    expect(back?.complete).toBe(true)
  })

  it("refuses a board file with another provider's offers or a non-web link", () => {
    const text = serializeBoard({ jobs: [job], proven: true, complete: true })
    expect(parseBoard(text, "LEVER")).toBeNull()
    expect(
      parseBoard(text.replace("https://job-boards", "javascript://job-boards"), "GREENHOUSE")
    ).toBeNull()
    expect(parseBoard("{", "GREENHOUSE")).toBeNull()
  })

  it("rejects a manifest in another shape", () => {
    expect(parseManifest(JSON.stringify(emptyManifest(now)))).not.toBeNull()
    expect(parseManifest(JSON.stringify({ ...emptyManifest(now), version: 2 }))).toBeNull()
    expect(parseManifest("not json")).toBeNull()
  })
})

describe("harvest run", () => {
  it("leaves career sites to the local worker", () => {
    expect(harvestableBoards([acme, beta, site]).map((board) => board.boardId)).toEqual([
      "acme",
      "beta",
    ])
  })

  it("lists both Lever hosts the adapter may call", () => {
    expect(boardHosts([acme, beta])).toEqual([
      "api.eu.lever.co",
      "api.lever.co",
      "boards-api.greenhouse.io",
    ])
  })

  it("reads a board again only when the last read set it due", () => {
    const first = mergeRun({
      previous: emptyManifest(now),
      results: [
        { board: acme, ok: true, at: now, content: "{}", jobs: 1, complete: true, note: null },
        { board: beta, ok: false, at: now, note: "HTTP 503" },
      ],
      deferred: 0,
      due: 2,
      startedAt: now,
      finishedAt: now,
      agent: "claude",
      everyMinutes: 120,
      hosts: [],
    })
    const later = new Date(now.getTime() + 60 * 60 * 1000)
    // A complete read waits a day; a failed board API is retried after 15 minutes.
    expect(dueBoards([acme, beta], first.manifest, later).map((board) => board.boardId)).toEqual([
      "beta",
    ])
    expect(first.files.has(boardPath("GREENHOUSE", "acme"))).toBe(true)
    expect(first.run).toMatchObject({
      indexed: 1,
      failed: 1,
      errors: [{ key: "LEVER:beta", note: "HTTP 503" }],
    })
  })

  it("keeps the last good read when a board fails, and writes no file when nothing changed", () => {
    const content = serializeBoard({ jobs: [job], proven: true, complete: true })
    const good = mergeRun({
      previous: emptyManifest(now),
      results: [{ board: acme, ok: true, at: now, content, jobs: 1, complete: true, note: null }],
      deferred: 0,
      due: 1,
      startedAt: now,
      finishedAt: now,
      agent: "claude",
      everyMinutes: null,
      hosts: [],
    }).manifest
    const next = new Date(now.getTime() + 25 * 60 * 60 * 1000)
    const failed = mergeRun({
      previous: good,
      results: [{ board: acme, ok: false, at: next, note: "timeout" }],
      deferred: 0,
      due: 1,
      startedAt: next,
      finishedAt: next,
      agent: "cursor",
      everyMinutes: null,
      hosts: [],
    })
    const entry = failed.manifest.boards[boardKey("GREENHOUSE", "acme")]
    expect(entry).toMatchObject({
      outcome: "failed",
      fetchedAt: now.toISOString(),
      hash: sha256(content),
      jobs: 1,
    })
    expect(failed.manifest.runs.map((run) => run.agent)).toEqual(["cursor", "claude"])

    const same = mergeRun({
      previous: good,
      results: [{ board: acme, ok: true, at: next, content, jobs: 1, complete: true, note: null }],
      deferred: 0,
      due: 1,
      startedAt: next,
      finishedAt: next,
      agent: "claude",
      everyMinutes: null,
      hosts: [],
    })
    expect(same.files.size).toBe(0)
  })

  it("imports each board from whichever branch read it last", () => {
    const entry = (fetchedAt: string | null) => ({
      provider: "GREENHOUSE" as const,
      boardId: "acme",
      companyName: "acme",
      checkedAt: now.toISOString(),
      fetchedAt,
      nextCheckAt: now.toISOString(),
      outcome: "indexed" as const,
      jobs: 1,
      complete: true,
      note: null,
      hash: "h",
    })
    const best = newestReads([
      {
        branch: "claude/newrole-harvest",
        boards: { "GREENHOUSE:acme": entry("2026-11-02T10:00:00.000Z") },
      },
      {
        branch: "cursor/newrole-harvest",
        boards: { "GREENHOUSE:acme": entry("2026-11-02T11:00:00.000Z") },
      },
      { branch: "codex/newrole-harvest", boards: { "GREENHOUSE:acme": entry(null) } },
    ])
    expect(best.get("GREENHOUSE:acme")?.branch).toBe("cursor/newrole-harvest")
  })
})
