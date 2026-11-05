import { Prisma } from "@newrole/jobs-lab-db"
import db from "./db"
import { indexNextDue } from "./index/run"
import { indexNextCatalog } from "./catalog/run"
import { ensureFxRates } from "@newrole/matching/fx"
import { maybeSyncOfferSearch } from "./discovery/offer-sync"
import { offerIndexEnabled } from "./offer-index"
import { maybeExpandSimilar, maybeHuntHiddenOffers } from "./discovery/hidden-offers"
import { executeSearch } from "./search/pipeline"
import {
  enqueueHarvestImport,
  enqueueSearch,
  HARVEST_CHECK_MS,
  HARVEST_IMPORT,
  INDEX_TASKS,
  INDEX_WATCHED,
  RUN_SEARCH,
} from "./queue"
import { harvestEnabled, importHarvest } from "./harvest/import"
import { jobIndexHost } from "./host"
import { indexNextWatched, indexWatchedPage } from "./watchlist/index-watched"

/**
 * The engine's worker: searches people started, watched companies, the seed catalog and the
 * checked outside catalog, harvests from a cloud agent, NBP rates. It claims only the index's own
 * task types (INDEX_TASKS), so it can share BackgroundTask with an app's worker.
 */

const WORKER_ID = `index-worker-${process.pid}`
const STALE_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 30_000
const SERVICE_BEAT_MS = 30_000

export { enqueueSearch }

let activeTaskId: string | null = null

export function currentTaskId(): string | null {
  return activeTaskId
}

function payloadField(payload: Prisma.JsonValue, key: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  return (payload as Record<string, unknown>)[key]
}

function payloadString(payload: Prisma.JsonValue, key: string): string | null {
  const value = payloadField(payload, key)
  return typeof value === "string" ? value : null
}

function readSearchRunId(payload: Prisma.JsonValue): string | null {
  return payloadString(payload, "searchRunId")
}

async function markRun(
  searchRunId: string | null,
  status: "RETRYING" | "FAILED" | "QUEUED",
  message: string
) {
  if (!searchRunId) return
  await db.searchRun.updateMany({
    where: { id: searchRunId, status: { in: ["QUEUED", "RUNNING", "RETRYING", "FAILED"] } },
    data: {
      status,
      phase: status === "FAILED" ? "failed" : status === "QUEUED" ? "queued" : "retrying",
      message,
      finishedAt: status === "FAILED" ? new Date() : null,
      errorSummary: status === "FAILED" ? message.slice(0, 400) : null,
    },
  })
}

export async function recoverStaleTasks() {
  const cutoff = new Date(Date.now() - STALE_MS)
  const stale = await db.backgroundTask.findMany({
    where: { status: "RUNNING", type: { in: [...INDEX_TASKS] }, lockedAt: { lt: cutoff } },
  })
  for (const task of stale) {
    const searchRunId = readSearchRunId(task.payload)
    if (task.attempts >= task.maxAttempts) {
      await db.backgroundTask.update({
        where: { id: task.id },
        data: { status: "DEAD", lastError: "Timed out", finishedAt: new Date() },
      })
      await markRun(searchRunId, "FAILED", "The worker timed out")
    } else {
      await db.backgroundTask.update({
        where: { id: task.id },
        data: { status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date() },
      })
      await markRun(searchRunId, "RETRYING", "Recovered after the worker stopped updating")
    }
  }
}

export async function requeueInFlight(taskId: string | null) {
  if (!taskId) return
  const task = await db.backgroundTask.findUnique({ where: { id: taskId } })
  if (!task || task.status !== "RUNNING") return
  await db.backgroundTask.update({
    where: { id: task.id },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date() },
  })
  await markRun(readSearchRunId(task.payload), "QUEUED", "Requeued after the worker stopped")
}

export async function claimTask() {
  const candidate = await db.backgroundTask.findFirst({
    where: { status: "PENDING", type: { in: [...INDEX_TASKS] }, runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
  })
  if (!candidate) return null
  const updated = await db.backgroundTask.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: {
      status: "RUNNING",
      lockedAt: new Date(),
      lockedBy: WORKER_ID,
      attempts: { increment: 1 },
    },
  })
  if (updated.count !== 1) return null
  return db.backgroundTask.findUnique({ where: { id: candidate.id } })
}

async function recordFailure(
  taskId: string,
  attempts: number,
  maxAttempts: number,
  message: string,
  payload: Prisma.JsonValue
) {
  const searchRunId = readSearchRunId(payload)
  if (attempts >= maxAttempts) {
    await db.backgroundTask.update({
      where: { id: taskId },
      data: { status: "DEAD", lastError: message.slice(0, 400), finishedAt: new Date() },
    })
    await markRun(searchRunId, "FAILED", message)
    return
  }
  const delay = Math.min(60_000, 2000 * 2 ** attempts)
  await db.backgroundTask.update({
    where: { id: taskId },
    data: {
      status: "PENDING",
      lastError: message.slice(0, 400),
      lockedAt: null,
      lockedBy: null,
      runAt: new Date(Date.now() + delay),
    },
  })
  await markRun(searchRunId, "RETRYING", "Retry scheduled")
}

export async function workOnce(signal?: { stopped: boolean }): Promise<boolean> {
  let task: Awaited<ReturnType<typeof claimTask>>
  try {
    task = await claimTask()
  } catch (error) {
    console.error("Claim failed", error)
    throw error
  }
  if (!task) return false
  activeTaskId = task.id
  const heartbeat = setInterval(() => {
    void db.backgroundTask
      .updateMany({
        where: { id: task!.id, status: "RUNNING", lockedBy: WORKER_ID },
        data: { lockedAt: new Date() },
      })
      .catch((error) => console.error("Heartbeat failed", error))
  }, HEARTBEAT_MS)
  heartbeat.unref()
  try {
    if (signal?.stopped) {
      await requeueInFlight(task.id)
      return true
    }
    if (task.type === RUN_SEARCH) {
      const searchRunId = readSearchRunId(task.payload)
      if (!searchRunId) throw new Error("Task is missing searchRunId")
      await executeSearch(searchRunId)
    } else if (task.type === INDEX_WATCHED) {
      const careerPageId = payloadString(task.payload, "careerPageId")
      if (!careerPageId) throw new Error("Task is missing careerPageId")
      await indexWatchedPage(careerPageId)
    } else if (task.type === HARVEST_IMPORT) {
      await importHarvest()
    } else {
      throw new Error(`Unknown task type ${task.type}`)
    }
    await db.backgroundTask.update({
      where: { id: task.id },
      data: { status: "SUCCEEDED", finishedAt: new Date(), lastError: null },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task failed"
    try {
      const failed = await db.backgroundTask.findUnique({ where: { id: task.id } })
      await recordFailure(
        task.id,
        failed?.attempts ?? task.attempts,
        failed?.maxAttempts ?? task.maxAttempts,
        message,
        task.payload
      )
    } catch (writeError) {
      console.error("Could not record task failure", writeError)
    }
  } finally {
    clearInterval(heartbeat)
    if (activeTaskId === task.id) activeTaskId = null
  }
  return true
}

export async function workerLoop(signal?: { stopped: boolean }) {
  let backoff = 1000
  let lastRecover = 0
  let lastHarvestCheck = 0
  // On its own timer: a long crawl must not look like a stopped worker on /setup.
  const beat = () => void jobIndexHost().heartbeat("worker")
  beat()
  setInterval(beat, SERVICE_BEAT_MS).unref()
  while (!signal?.stopped) {
    try {
      if (Date.now() - lastRecover > 60_000) {
        await recoverStaleTasks()
        lastRecover = Date.now()
      }
      if (
        offerIndexEnabled() &&
        harvestEnabled() &&
        Date.now() - lastHarvestCheck > HARVEST_CHECK_MS
      ) {
        await enqueueHarvestImport()
        lastHarvestCheck = Date.now()
      }
      // NBP rates for salary comparison; a no-op until the 12-hour refresh is due.
      if (offerIndexEnabled()) await ensureFxRates()
      const did = await workOnce(signal)
      backoff = 1000
      const indexing = offerIndexEnabled()
      if (!did && !signal?.stopped) {
        // Watched companies first, then the seed catalog, then the checked outside catalog.
        const indexed =
          indexing &&
          ((await indexNextWatched()) || (await indexNextDue()) || (await indexNextCatalog()))
        if (!indexed) await sleep(5000)
      }
      if (indexing && !signal?.stopped) await maybeSyncOfferSearch()
      if (indexing && !signal?.stopped) await maybeHuntHiddenOffers()
      if (indexing && !signal?.stopped) await maybeExpandSimilar()
    } catch (error) {
      console.error("Worker loop error", error)
      await sleep(backoff)
      backoff = Math.min(30_000, backoff * 2)
    }
  }
  try {
    await requeueInFlight(activeTaskId)
  } catch (error) {
    console.error("Could not requeue in-flight work", error)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
