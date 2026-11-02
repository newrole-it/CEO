import { accessSync, constants } from "node:fs"
import { delimiter, join } from "node:path"
import db from "db"
import type { SourceType } from "src/shared/schemas"
import { boardHosts, harvestableBoards } from "src/server/harvest/collect"
import { boardKey, type HarvestRun } from "src/server/harvest/format"
import { harvestEnabled, harvestRemote, type BranchFacts } from "src/server/harvest/import"
import {
  buildFetchProgress,
  fetchState,
  type FetchBoard,
  type FetchProgress,
  type FetchState,
} from "src/server/index/progress"
import { indexableBoards, isCareerProvider } from "src/server/index/run"
import { isLocalInstall } from "src/server/local-install"
import { HARVEST_CHECK_MS, HARVEST_IMPORT } from "src/server/queue/enqueue"
import { claudeFacts } from "src/server/setup/status"
import { workerAlive } from "src/server/setup/steps"
import { isIndexablePage } from "src/server/watchlist/index-watched"

export type SyncBoard = {
  key: string
  company: string
  provider: string
  /** Board API (the cloud can read it) or a career site (only this computer reads it). */
  kind: "api" | "career"
  state: FetchState
  watched: boolean
  lastFetchedAt: string | null
  nextCheckAt: string | null
  jobs: number
  note: string | null
  /** Where the read the index holds came from. Null before the first read. */
  origin: "cloud" | "local" | null
}

export type ExpectedRun = {
  at: string
  /** declared: the --every the agent's prompt passes. observed: the median gap between runs. */
  basis: "declared" | "observed"
  minutes: number
  /** No run has arrived although the expected time passed more than one interval ago. */
  late: boolean
}

export type SyncStatus = {
  now: string
  local: boolean
  worker: { lastSeenAt: string | null; alive: boolean }
  summary: FetchProgress
  offers: number
  boards: SyncBoard[]
  queue: {
    type: string
    pending: number
    running: number
    failedDay: number
    lastFinishedAt: string | null
  }[]
  harvest: {
    enabled: boolean
    remote: string
    apiBoards: number
    careerBoards: number
    hosts: string[]
    checking: boolean
    lastCheck: { at: string; status: string; error: string | null } | null
    nextCheckAt: string | null
    lastImport: { at: string; boards: number; stored: number; closed: number } | null
    branches: BranchFacts[]
    lastRun: (HarvestRun & { branch: string }) | null
    expected: ExpectedRun | null
  }
  agents: {
    claude: { installed: boolean; loggedIn: boolean | null }
    codex: { installed: boolean }
    cursor: { installed: boolean }
  }
}

function onPath(name: string, env: Record<string, string | undefined> = process.env): boolean {
  return (env.PATH || "")
    .split(delimiter)
    .filter(Boolean)
    .some((dir) => {
      try {
        accessSync(join(dir, name), constants.X_OK)
        return true
      } catch {
        return false
      }
    })
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/**
 * When the next cloud run should land. None of the three platforms publishes a task's schedule
 * through an API, so this is the interval the prompt declares, or failing that the median gap
 * between the runs the branches show. Null with too little to go on.
 */
export function expectedNextRun(runs: HarvestRun[], now: Date): ExpectedRun | null {
  if (!runs.length) return null
  const starts = runs.map((run) => Date.parse(run.startedAt)).sort((a, b) => b - a)
  const latest = starts[0]
  const declared = runs.find((run) => run.everyMinutes)?.everyMinutes ?? null
  let minutes = declared
  let basis: ExpectedRun["basis"] = "declared"
  if (!minutes) {
    const gaps = starts
      .slice(0, -1)
      .map((start, index) => start - starts[index + 1])
      .filter((gap) => gap > 0)
    const gap = median(gaps.slice(0, 10))
    if (!gap) return null
    minutes = Math.round(gap / 60_000)
    basis = "observed"
  }
  const at = latest + minutes * 60_000
  return {
    at: new Date(at).toISOString(),
    basis,
    minutes,
    late: now.getTime() > at + minutes * 60_000,
  }
}

/** Every run across the branches, newest first. */
export function allRuns(branches: BranchFacts[]): (HarvestRun & { branch: string })[] {
  return branches
    .flatMap((branch) => branch.runs.map((run) => ({ ...run, branch: branch.name })))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
}

const STATE_ORDER: Record<FetchState, number> = {
  reading: 0,
  waiting: 1,
  failed: 2,
  partial: 3,
  ready: 4,
}

/**
 * The facts behind /sync: what the worker on this computer reads, what is queued, and what the
 * cloud agents pushed. Boards are the seed catalog plus the person's own watched companies, as
 * on /companies, so companies only other people watch never show here.
 */
export async function syncStatus(userId: number, now = new Date()): Promise<SyncStatus> {
  const seeds = indexableBoards()
  const [pages, watches, activeSearches, heartbeat, tasks, failedDay, imports, claude, offers] =
    await Promise.all([
      db.careerPage.findMany({
        select: {
          companyId: true,
          provider: true,
          providerBoardId: true,
          enabled: true,
          lastSuccessfulFetchAt: true,
          lastCheckedAt: true,
          nextCheckAt: true,
          indexComplete: true,
          lastErrorCode: true,
          fetchNote: true,
          company: { select: { name: true } },
          _count: { select: { jobs: { where: { status: "ACTIVE" } } } },
        },
      }),
      db.watchedCompany.findMany({ where: { userId }, select: { companyId: true } }),
      db.backgroundTask.count({
        where: { type: "RUN_SEARCH", status: { in: ["PENDING", "RUNNING"] } },
      }),
      db.serviceHeartbeat.findUnique({ where: { service: "worker" } }),
      db.backgroundTask.groupBy({
        by: ["type", "status"],
        where: { status: { in: ["PENDING", "RUNNING"] } },
        _count: { _all: true },
      }),
      db.backgroundTask.groupBy({
        by: ["type"],
        where: {
          status: "DEAD",
          finishedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        _count: { _all: true },
        _max: { finishedAt: true },
      }),
      db.harvestImport.findMany({ orderBy: { startedAt: "desc" }, take: 50 }),
      claudeFacts(now.getTime()),
      db.job.count({ where: { status: "ACTIVE" } }),
    ])

  const mine = new Set(watches.map((watch) => watch.companyId))
  const byKey = new Map(
    pages
      .filter((page) => page.providerBoardId)
      .map((page) => [boardKey(page.provider, page.providerBoardId!), page])
  )
  // The cloud read time of each board, from the newest import that applied it.
  const cloudReads = new Map<string, number>()
  for (const row of [...imports].reverse()) {
    for (const item of (row.applied as { key: string; fetchedAt: string }[] | null) ?? []) {
      cloudReads.set(item.key, Date.parse(item.fetchedAt))
    }
  }

  const fetchBoards: FetchBoard[] = []
  const boards: SyncBoard[] = []
  const add = (
    page: (typeof pages)[number] | undefined,
    provider: SourceType,
    boardId: string,
    company: string
  ) => {
    const key = boardKey(provider, boardId)
    const board: FetchBoard = {
      company: page?.company.name || company,
      lastSuccessfulFetchAt: page?.lastSuccessfulFetchAt ?? null,
      lastCheckedAt: page?.lastCheckedAt ?? null,
      nextCheckAt: page?.nextCheckAt ?? null,
      indexComplete: page?.indexComplete ?? false,
      lastErrorCode: page?.lastErrorCode ?? null,
      fetchNote: page?.fetchNote ?? null,
      watchedCompanyId: page && mine.has(page.companyId) ? page.companyId : null,
    }
    fetchBoards.push(board)
    const fetched = board.lastSuccessfulFetchAt?.getTime() ?? null
    boards.push({
      key,
      company: board.company,
      provider,
      kind: isCareerProvider(provider) ? "career" : "api",
      state: fetchState(board, now),
      watched: Boolean(board.watchedCompanyId),
      lastFetchedAt: board.lastSuccessfulFetchAt?.toISOString() ?? null,
      nextCheckAt: board.nextCheckAt?.toISOString() ?? null,
      jobs: page?._count.jobs ?? 0,
      note: board.lastErrorCode || board.fetchNote ? board.fetchNote : null,
      origin: fetched === null ? null : cloudReads.get(key) === fetched ? "cloud" : "local",
    })
  }
  const seedKeys = new Set<string>()
  for (const seed of seeds) {
    const key = boardKey(seed.provider, seed.boardId)
    seedKeys.add(key)
    add(byKey.get(key), seed.provider, seed.boardId, seed.companyName)
  }
  for (const page of pages) {
    if (!mine.has(page.companyId) || !isIndexablePage(page)) continue
    if (seedKeys.has(boardKey(page.provider, page.providerBoardId ?? ""))) continue
    add(page, page.provider, page.providerBoardId ?? page.companyId, page.company.name)
  }
  boards.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      Number(b.watched) - Number(a.watched) ||
      a.company.localeCompare(b.company)
  )

  const types = new Set([...tasks.map((row) => row.type), ...failedDay.map((row) => row.type)])
  const queue = [...types].sort().map((type) => {
    const count = (status: string) =>
      tasks.find((row) => row.type === type && row.status === status)?._count._all ?? 0
    const dead = failedDay.find((row) => row.type === type)
    return {
      type,
      pending: count("PENDING"),
      running: count("RUNNING"),
      failedDay: dead?._count._all ?? 0,
      lastFinishedAt: dead?._max.finishedAt?.toISOString() ?? null,
    }
  })

  const lastCheck = imports[0] ?? null
  const lastImport = imports.find((row) => row.status === "imported") ?? null
  const withBranches = imports.find(
    (row) => Array.isArray(row.branches) && (row.branches as unknown[]).length
  )
  const branches = ((withBranches?.branches as BranchFacts[] | undefined) ?? []).sort(
    (a, b) => Date.parse(b.generatedAt ?? "") - Date.parse(a.generatedAt ?? "") || 0
  )
  const runs = allRuns(branches)
  const workerSeenAt = heartbeat?.lastSeenAt ?? null
  const alive = workerAlive(workerSeenAt, now)
  const api = harvestableBoards(seeds)
  const checking = (tasks.find((row) => row.type === HARVEST_IMPORT)?._count._all ?? 0) > 0

  return {
    now: now.toISOString(),
    local: isLocalInstall(),
    worker: { lastSeenAt: workerSeenAt?.toISOString() ?? null, alive },
    summary: buildFetchProgress({ now, boards: fetchBoards, activeSearches, workerSeenAt }),
    offers,
    boards,
    queue,
    harvest: {
      enabled: harvestEnabled(),
      remote: harvestRemote(),
      apiBoards: api.length,
      careerBoards: seeds.length - api.length,
      hosts: boardHosts(api),
      checking,
      lastCheck: lastCheck
        ? {
            at: (lastCheck.finishedAt ?? lastCheck.startedAt).toISOString(),
            status: lastCheck.status,
            error: lastCheck.error,
          }
        : null,
      // The worker queues a check every HARVEST_CHECK_MS while it runs.
      nextCheckAt:
        alive && harvestEnabled() && lastCheck
          ? new Date(lastCheck.startedAt.getTime() + HARVEST_CHECK_MS).toISOString()
          : null,
      lastImport: lastImport
        ? {
            at: (lastImport.finishedAt ?? lastImport.startedAt).toISOString(),
            boards: lastImport.boards,
            stored: lastImport.stored,
            closed: lastImport.closed,
          }
        : null,
      branches,
      lastRun: runs[0] ?? null,
      expected: expectedNextRun(runs, now),
    },
    agents: {
      claude: { installed: claude.installed, loggedIn: claude.loggedIn },
      codex: { installed: onPath("codex") },
      cursor: { installed: onPath("cursor-agent") },
    },
  }
}
