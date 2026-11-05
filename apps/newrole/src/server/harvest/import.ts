import { Prisma } from "@prisma/client"
import db from "db"
import { indexableBoards } from "src/server/index/run"
import { INDEX_STALE_MS } from "src/server/index/progress"
import { INDEXING_NOTE, storeBoardInventory } from "src/server/index/store"
import { harvestableBoards } from "./collect"
import {
  boardKey,
  boardPath,
  MANIFEST_PATH,
  parseBoard,
  parseManifest,
  sha256,
  type HarvestBoard,
  type HarvestRun,
} from "./format"
import {
  fetchBranches,
  gitAvailable,
  localRef,
  readFileAt,
  readFilesAt,
  remoteHarvestBranches,
} from "./git"

/** Rows kept in HarvestImport. Older checks are deleted. */
const KEEP_IMPORTS = 50
/** Runs per branch copied into a HarvestImport row for the sync page. */
const RUNS_SHOWN = 12

export type ImportStatus = "imported" | "nothing_new" | "no_branch" | "unavailable" | "failed"

export type BranchFacts = {
  name: string
  commit: string
  generatedAt: string | null
  /** False when the manifest is missing or not in the expected format. */
  readable: boolean
  runs: HarvestRun[]
  boards: number
  failing: { key: string; company: string; note: string | null; checkedAt: string }[]
}

export function harvestRemote(env: Record<string, string | undefined> = process.env): string {
  return env.HARVEST_REMOTE?.trim() || "origin"
}

export function harvestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.HARVEST?.trim().toLowerCase() !== "off"
}

/** For every board, the newest successful cloud read across all harvest branches. */
export function newestReads(
  manifests: { branch: string; boards: Record<string, HarvestBoard> }[]
): Map<string, { branch: string; entry: HarvestBoard }> {
  const best = new Map<string, { branch: string; entry: HarvestBoard }>()
  for (const { branch, boards } of manifests) {
    for (const [key, entry] of Object.entries(boards)) {
      if (!entry.fetchedAt || !entry.hash) continue
      const current = best.get(key)
      if (!current || Date.parse(entry.fetchedAt) > Date.parse(current.entry.fetchedAt!)) {
        best.set(key, { branch, entry })
      }
    }
  }
  return best
}

async function record(data: {
  startedAt: Date
  status: ImportStatus
  branches?: BranchFacts[]
  applied?: { key: string; fetchedAt: string }[]
  boards?: number
  stored?: number
  closed?: number
  error?: string | null
}) {
  await db.harvestImport.create({
    data: {
      startedAt: data.startedAt,
      finishedAt: new Date(),
      status: data.status,
      branches: (data.branches ?? []) as unknown as Prisma.InputJsonValue,
      applied: (data.applied ?? []) as unknown as Prisma.InputJsonValue,
      boards: data.boards ?? 0,
      stored: data.stored ?? 0,
      closed: data.closed ?? 0,
      error: data.error?.slice(0, 500) ?? null,
    },
  })
  const old = await db.harvestImport.findMany({
    orderBy: { startedAt: "desc" },
    skip: KEEP_IMPORTS,
    select: { id: true },
  })
  if (old.length)
    await db.harvestImport.deleteMany({ where: { id: { in: old.map((row) => row.id) } } })
}

/**
 * Brings in what cloud agents read while this computer was off. Only boards from this install's
 * own seed catalog are taken, only when the cloud read is newer than the local one, and every
 * board file has to match the hash its manifest gives.
 */
export async function importHarvest(
  options: { cwd?: string; remote?: string; now?: Date } = {}
): Promise<{ status: ImportStatus; boards: number; stored: number }> {
  const cwd = options.cwd ?? process.cwd()
  const remote = options.remote ?? harvestRemote()
  const startedAt = options.now ?? new Date()
  const git = { cwd }
  if (!(await gitAvailable(git))) {
    await record({ startedAt, status: "unavailable", error: "No git checkout in the app folder" })
    return { status: "unavailable", boards: 0, stored: 0 }
  }
  let remoteBranches: { name: string; commit: string }[]
  try {
    remoteBranches = await remoteHarvestBranches(remote, git)
  } catch (error) {
    const message = error instanceof Error ? error.message : "git ls-remote failed"
    await record({ startedAt, status: "unavailable", error: message })
    return { status: "unavailable", boards: 0, stored: 0 }
  }
  if (!remoteBranches.length) {
    await record({ startedAt, status: "no_branch" })
    return { status: "no_branch", boards: 0, stored: 0 }
  }

  const branches: BranchFacts[] = []
  const applied: { key: string; fetchedAt: string }[] = []
  let stored = 0
  let closed = 0
  try {
    await fetchBranches(
      remote,
      remoteBranches.map((branch) => branch.name),
      git
    )
    const manifests: { branch: string; boards: Record<string, HarvestBoard> }[] = []
    for (const branch of remoteBranches) {
      const text = await readFileAt(localRef(branch.name), MANIFEST_PATH, git)
      const manifest = text ? parseManifest(text) : null
      branches.push({
        name: branch.name,
        commit: branch.commit,
        generatedAt: manifest?.generatedAt ?? null,
        readable: Boolean(manifest),
        runs: manifest?.runs.slice(0, RUNS_SHOWN) ?? [],
        boards: manifest ? Object.keys(manifest.boards).length : 0,
        failing: manifest
          ? Object.entries(manifest.boards)
              .filter(([, entry]) => entry.outcome === "failed")
              .slice(0, 20)
              .map(([key, entry]) => ({
                key,
                company: entry.companyName,
                note: entry.note,
                checkedAt: entry.checkedAt,
              }))
          : [],
      })
      if (manifest) manifests.push({ branch: branch.name, boards: manifest.boards })
    }

    const seeds = new Map(
      harvestableBoards(indexableBoards()).map((board) => [
        boardKey(board.provider, board.boardId),
        board,
      ])
    )
    const best = [...newestReads(manifests).entries()].filter(([key]) => seeds.has(key))
    const pages = await db.careerPage.findMany({
      where: {
        OR: best.map(([, { entry }]) => ({
          provider: entry.provider,
          providerBoardId: entry.boardId,
        })),
      },
      select: {
        provider: true,
        providerBoardId: true,
        lastSuccessfulFetchAt: true,
        lastCheckedAt: true,
        fetchNote: true,
      },
    })
    const local = new Map(
      pages.map((page) => [boardKey(page.provider, page.providerBoardId ?? ""), page])
    )
    const now = Date.now()
    const fresh = best.filter(([key, { entry }]) => {
      const page = local.get(key)
      // The worker is reading this board right now; its own read wins.
      if (
        page?.fetchNote === INDEXING_NOTE &&
        page.lastCheckedAt &&
        now - page.lastCheckedAt.getTime() < INDEX_STALE_MS
      ) {
        return false
      }
      return (
        !page?.lastSuccessfulFetchAt ||
        Date.parse(entry.fetchedAt!) > page.lastSuccessfulFetchAt.getTime()
      )
    })
    if (!fresh.length) {
      await record({ startedAt, status: "nothing_new", branches })
      return { status: "nothing_new", boards: 0, stored: 0 }
    }

    const byBranch = new Map<string, [string, HarvestBoard][]>()
    for (const [key, { branch, entry }] of fresh) {
      byBranch.set(branch, [...(byBranch.get(branch) ?? []), [key, entry]])
    }
    const rejected: string[] = []
    for (const [branch, entries] of byBranch) {
      const files = await readFilesAt(
        localRef(branch),
        entries.map(([, entry]) => boardPath(entry.provider, entry.boardId)),
        git
      )
      for (const [key, entry] of entries) {
        const text = files.get(boardPath(entry.provider, entry.boardId))
        const listed = text && sha256(text) === entry.hash ? parseBoard(text, entry.provider) : null
        if (!listed) {
          rejected.push(key)
          continue
        }
        const fetchedAt = new Date(entry.fetchedAt!)
        const result = await storeBoardInventory({
          board: seeds.get(key)!,
          listed,
          now: fetchedAt,
          nextCheckAt: new Date(entry.nextCheckAt),
        })
        stored += result.stored
        closed += result.closed
        applied.push({ key, fetchedAt: entry.fetchedAt! })
      }
    }
    const error = rejected.length
      ? `Skipped ${rejected.length} board file(s) that did not match the manifest: ${rejected
          .slice(0, 5)
          .join(", ")}`
      : null
    await record({
      startedAt,
      status: applied.length ? "imported" : "failed",
      branches,
      applied,
      boards: applied.length,
      stored,
      closed,
      error,
    })
    return { status: applied.length ? "imported" : "failed", boards: applied.length, stored }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed"
    await record({
      startedAt,
      status: "failed",
      branches,
      applied,
      boards: applied.length,
      stored,
      closed,
      error: message,
    })
    throw error
  }
}
