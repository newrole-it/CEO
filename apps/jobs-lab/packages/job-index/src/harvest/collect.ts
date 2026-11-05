import type { SeedBoard } from "../config/seed-boards"
import { adapterFor, type LiveAts } from "@newrole/ats/adapters/registry"
import { isCareerProvider, isEmptyBoardNote, settleApiList } from "../index/run"
import { BOARD_RETRY_MS, nextCrawlAt } from "../index/schedule"
import type { HttpClient } from "@newrole/ats/host"
import {
  boardKey,
  boardPath,
  RUNS_KEPT,
  serializeBoard,
  sha256,
  type HarvestAgent,
  type HarvestBoard,
  type HarvestManifest,
  type HarvestRun,
} from "./format"

/**
 * The boards a cloud run reads: board APIs only. Career sites, SuccessFactors and Workday are read
 * page by page under a daily cap per host that lives in the local database, so they stay with the
 * worker on this computer.
 */
export function harvestableBoards(boards: SeedBoard[]): SeedBoard[] {
  return boards.filter((board) => !isCareerProvider(board.provider))
}

/** Due by the worker's own schedule: never read, or past the next check the last read set. */
export function dueBoards(boards: SeedBoard[], manifest: HarvestManifest, now: Date): SeedBoard[] {
  const due = boards.filter((board) => {
    const entry = manifest.boards[boardKey(board.provider, board.boardId)]
    return !entry || Date.parse(entry.nextCheckAt) <= now.getTime()
  })
  const at = (board: SeedBoard) =>
    Date.parse(manifest.boards[boardKey(board.provider, board.boardId)]?.nextCheckAt ?? "") || 0
  return due.sort((a, b) => at(a) - at(b) || b.priority - a.priority)
}

/** Hosts a run talks to, for the agent's network allowlist. */
export function boardHosts(boards: SeedBoard[]): string[] {
  const hosts = new Set<string>()
  for (const board of boards) {
    try {
      hosts.add(new URL(board.apiUrl).host)
    } catch {}
    // src/server/adapters/lever.ts tries api.lever.co, then api.eu.lever.co.
    if (board.provider === "LEVER") {
      hosts.add("api.lever.co")
      hosts.add("api.eu.lever.co")
    }
  }
  return [...hosts].sort()
}

function hostOf(board: SeedBoard): string {
  try {
    return new URL(board.apiUrl).host
  } catch {
    return board.apiUrl
  }
}

/** Records every host the run sends a request to. */
export function recordingClient(http: HttpClient, hosts: Set<string>): HttpClient {
  const note = (url: string) => {
    try {
      hosts.add(new URL(url).host)
    } catch {}
  }
  return {
    get: (url, opts) => {
      note(url)
      return http.get(url, opts)
    },
    post: (url, body, opts) => {
      note(url)
      return http.post(url, body, opts)
    },
  }
}

type ReadResult =
  | {
      board: SeedBoard
      ok: true
      at: Date
      content: string
      jobs: number
      complete: boolean
      note: string | null
    }
  | { board: SeedBoard; ok: false; at: Date; note: string }

/** One board through the same adapter and the same proof rules as src/server/index/run.ts. */
async function readBoard(board: SeedBoard, http: HttpClient, now: () => Date): Promise<ReadResult> {
  const at = now()
  try {
    const listed = await adapterFor(board.provider as LiveAts).list(
      board.boardId,
      http,
      board.companyName
    )
    if (!listed.proven && !isEmptyBoardNote(listed.note)) {
      return { board, ok: false, at, note: listed.note || "Board was not proven" }
    }
    const settled = settleApiList(listed)
    return {
      board,
      ok: true,
      at,
      content: serializeBoard(settled),
      jobs: settled.jobs.length,
      complete: settled.complete === true,
      note: settled.note?.slice(0, 500) ?? null,
    }
  } catch (error) {
    return { board, ok: false, at, note: error instanceof Error ? error.message : "Index failed" }
  }
}

/**
 * Reads the due boards until the deadline. One queue per host, the queues side by side: the
 * 1-second pace is per host, so this is as fast as the worker's rules allow and no faster.
 */
export async function readDueBoards(args: {
  boards: SeedBoard[]
  http: HttpClient
  deadline: number
  now?: () => Date
  log?: (line: string) => void
}): Promise<{ results: ReadResult[]; deferred: number }> {
  const now = args.now ?? (() => new Date())
  const queues = new Map<string, SeedBoard[]>()
  for (const board of args.boards) {
    const host = hostOf(board)
    queues.set(host, [...(queues.get(host) ?? []), board])
  }
  const results: ReadResult[] = []
  let deferred = 0
  await Promise.all(
    [...queues.values()].map(async (queue) => {
      for (const [index, board] of queue.entries()) {
        if (now().getTime() >= args.deadline) {
          deferred += queue.length - index
          return
        }
        const result = await readBoard(board, args.http, now)
        results.push(result)
        args.log?.(
          result.ok
            ? `${board.companyName}: ${result.jobs} offers${result.complete ? "" : " (partial)"}`
            : `${board.companyName}: failed, ${result.note}`
        )
      }
    })
  )
  return { results, deferred }
}

/**
 * The manifest after a run, and the board files that changed. A failed read keeps the previous
 * offers and their read time; only the attempt and the retry time move.
 */
export function mergeRun(args: {
  previous: HarvestManifest
  results: ReadResult[]
  deferred: number
  due: number
  startedAt: Date
  finishedAt: Date
  agent: HarvestAgent
  everyMinutes: number | null
  hosts: string[]
}): { manifest: HarvestManifest; files: Map<string, string>; run: HarvestRun } {
  const boards: Record<string, HarvestBoard> = { ...args.previous.boards }
  const files = new Map<string, string>()
  const errors: HarvestRun["errors"] = []
  let indexed = 0
  let failed = 0
  let jobs = 0
  for (const result of args.results) {
    const { board } = result
    const key = boardKey(board.provider, board.boardId)
    const before = boards[key]
    if (result.ok) {
      const hash = sha256(result.content)
      if (hash !== before?.hash) files.set(boardPath(board.provider, board.boardId), result.content)
      boards[key] = {
        provider: board.provider,
        boardId: board.boardId,
        companyName: board.companyName,
        checkedAt: result.at.toISOString(),
        fetchedAt: result.at.toISOString(),
        nextCheckAt: nextCrawlAt(result.at, result.complete, false, result.jobs > 0).toISOString(),
        outcome: "indexed",
        jobs: result.jobs,
        complete: result.complete,
        note: result.note,
        hash,
      }
      indexed += 1
      jobs += result.jobs
    } else {
      boards[key] = {
        provider: board.provider,
        boardId: board.boardId,
        companyName: board.companyName,
        checkedAt: result.at.toISOString(),
        fetchedAt: before?.fetchedAt ?? null,
        nextCheckAt: new Date(result.at.getTime() + BOARD_RETRY_MS).toISOString(),
        outcome: "failed",
        jobs: before?.jobs ?? 0,
        complete: before?.complete ?? false,
        note: result.note.slice(0, 500),
        hash: before?.hash ?? null,
      }
      failed += 1
      if (errors.length < 10) errors.push({ key, note: result.note.slice(0, 200) })
    }
  }
  const run: HarvestRun = {
    startedAt: args.startedAt.toISOString(),
    finishedAt: args.finishedAt.toISOString(),
    agent: args.agent,
    everyMinutes: args.everyMinutes,
    due: args.due,
    indexed,
    failed,
    deferred: args.deferred,
    jobs,
    hosts: args.hosts,
    errors,
  }
  const manifest: HarvestManifest = {
    version: args.previous.version,
    generatedAt: args.finishedAt.toISOString(),
    runs: [run, ...args.previous.runs].slice(0, RUNS_KEPT),
    boards,
  }
  return { manifest, files, run }
}
