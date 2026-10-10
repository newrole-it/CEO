import {Prisma} from "@prisma/client"
import db from "db"
import {executeSearch} from "src/server/search/pipeline"
import {enqueueSearch} from "src/server/queue/enqueue"

const WORKER_ID = `worker-${process.pid}`

export {enqueueSearch}

export async function recoverStaleTasks() {
  const cutoff = new Date(Date.now() - 20 * 60 * 1000)
  const stale = await db.backgroundTask.findMany({
    where: {status: "RUNNING", lockedAt: {lt: cutoff}},
  })
  for (const task of stale) {
    if (task.attempts >= task.maxAttempts) {
      await db.backgroundTask.update({
        where: {id: task.id},
        data: {status: "DEAD", lastError: "Timed out", finishedAt: new Date()},
      })
      const searchRunId = readSearchRunId(task.payload)
      if (searchRunId) {
        await db.searchRun.updateMany({
          where: {id: searchRunId, status: "RUNNING"},
          data: {status: "FAILED", errorSummary: "The worker timed out", finishedAt: new Date(), phase: "failed"},
        })
      }
    } else {
      await db.backgroundTask.update({
        where: {id: task.id},
        data: {status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date()},
      })
    }
  }
}

function readSearchRunId(payload: Prisma.JsonValue): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  const value = (payload as {searchRunId?: unknown}).searchRunId
  return typeof value === "string" ? value : null
}

export async function claimTask() {
  const candidate = await db.backgroundTask.findFirst({
    where: {status: "PENDING", runAt: {lte: new Date()}},
    orderBy: {runAt: "asc"},
  })
  if (!candidate) return null
  const updated = await db.backgroundTask.updateMany({
    where: {id: candidate.id, status: "PENDING"},
    data: {status: "RUNNING", lockedAt: new Date(), lockedBy: WORKER_ID, attempts: {increment: 1}},
  })
  if (updated.count !== 1) return null
  return db.backgroundTask.findUnique({where: {id: candidate.id}})
}

export async function workOnce(): Promise<boolean> {
  const task = await claimTask()
  if (!task) return false
  try {
    if (task.type === "RUN_SEARCH") {
      const searchRunId = readSearchRunId(task.payload)
      if (!searchRunId) throw new Error("Task is missing searchRunId")
      await executeSearch(searchRunId)
    } else {
      throw new Error(`Unknown task type ${task.type}`)
    }
    await db.backgroundTask.update({
      where: {id: task.id},
      data: {status: "SUCCEEDED", finishedAt: new Date(), lastError: null},
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Task failed"
    const failed = await db.backgroundTask.findUnique({where: {id: task.id}})
    const attempts = failed?.attempts ?? task.attempts
    const maxAttempts = failed?.maxAttempts ?? task.maxAttempts
    if (attempts >= maxAttempts) {
      await db.backgroundTask.update({
        where: {id: task.id},
        data: {status: "DEAD", lastError: message.slice(0, 400), finishedAt: new Date()},
      })
    } else {
      const delay = Math.min(60_000, 2000 * 2 ** attempts)
      await db.backgroundTask.update({
        where: {id: task.id},
        data: {
          status: "PENDING",
          lastError: message.slice(0, 400),
          lockedAt: null,
          lockedBy: null,
          runAt: new Date(Date.now() + delay),
        },
      })
    }
  }
  return true
}

export async function workerLoop(signal?: {stopped: boolean}) {
  await recoverStaleTasks()
  while (!signal?.stopped) {
    const did = await workOnce()
    if (!did) await new Promise((resolve) => setTimeout(resolve, 1000))
  }
}
