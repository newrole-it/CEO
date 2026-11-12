import { Prisma } from "@prisma/client"
import db from "db"
import { APP_TASKS, GMAIL_SYNC, SHEET_SYNC } from "src/server/queue/enqueue"
import { enqueueStaleSheetSyncs, syncSheet } from "src/server/applications/sheet"
import { maybeSyncCompanyAliases } from "src/server/companies/aliases"

/**
 * newrole.it's background work: the Google Sheet mirror of the applications and the company names
 * the extension matches offers by. It runs inside the Next server (startInServer, called from
 * src/instrumentation.ts), not in a process of its own. It claims only APP_TASKS, and claims each
 * task atomically, so a second server or an offer index's worker (@newrole/job-index) can run on
 * the same database without two of them taking one task.
 */

const WORKER_ID = `worker-${process.pid}`
const STALE_MS = 20 * 60 * 1000
const HEARTBEAT_MS = 30_000

let activeTaskId: string | null = null

function payloadField(payload: Prisma.JsonValue, key: string): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null
  return (payload as Record<string, unknown>)[key]
}

function payloadNumber(payload: Prisma.JsonValue, key: string): number | null {
  const value = payloadField(payload, key)
  return typeof value === "number" ? value : null
}

export async function recoverStaleTasks() {
  const cutoff = new Date(Date.now() - STALE_MS)
  const stale = await db.backgroundTask.findMany({
    where: { status: "RUNNING", type: { in: [...APP_TASKS] }, lockedAt: { lt: cutoff } },
  })
  for (const task of stale) {
    await db.backgroundTask.update({
      where: { id: task.id },
      data:
        task.attempts >= task.maxAttempts
          ? { status: "DEAD", lastError: "Timed out", finishedAt: new Date() }
          : { status: "PENDING", lockedAt: null, lockedBy: null, runAt: new Date() },
    })
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
}

export async function claimTask() {
  const candidate = await db.backgroundTask.findFirst({
    where: { status: "PENDING", type: { in: [...APP_TASKS] }, runAt: { lte: new Date() } },
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
  message: string
) {
  if (attempts >= maxAttempts) {
    await db.backgroundTask.update({
      where: { id: taskId },
      data: { status: "DEAD", lastError: message.slice(0, 400), finishedAt: new Date() },
    })
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
    if (task.type === SHEET_SYNC) {
      const userId = payloadNumber(task.payload, "userId")
      if (!userId) throw new Error("Task is missing userId")
      const result = await syncSheet(userId)
      if (result.status === "failed") throw new Error(result.message)
    } else if (task.type === GMAIL_SYNC) {
      // The mailbox is no longer searched: a message is used only when the person picks it in the
      // extension. A task queued before that change finishes without doing anything.
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
        message
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
  while (!signal?.stopped) {
    try {
      if (Date.now() - lastRecover > 60_000) {
        await recoverStaleTasks()
        // Edits made in the sheet come in on this beat too.
        await enqueueStaleSheetSyncs()
        lastRecover = Date.now()
      }
      // The company names the extension tells offers apart by; a no-op until a refresh is due.
      await maybeSyncCompanyAliases()
      const did = await workOnce(signal)
      backoff = 1000
      if (!did && !signal?.stopped) await sleep(5000)
    } catch (error) {
      console.error("Background work error", error)
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

const STARTED = Symbol.for("newrole.backgroundWork")

/**
 * Starts the loop in this process and returns at once. Once per process: register() runs once, and
 * the mark is on globalThis, which outlives a module that next dev loads again. The loop logs a
 * failure and retries with its backoff, so a database that is down never stops the server.
 */
export function startInServer() {
  const scope = globalThis as { [STARTED]?: boolean }
  if (scope[STARTED]) return
  scope[STARTED] = true
  const signal = { stopped: false }
  const stop = (kind: NodeJS.Signals) => {
    if (signal.stopped) return
    signal.stopped = true
    console.log(`newrole.it background work stopping on ${kind}`)
    // Now, not after a grace period: Next exits as soon as its own cleanup ends, and next dev
    // kills its server 100 ms after the signal. In next dev, Ctrl+C exits in this same tick
    // (below), before the write lands. A task that still finishes stays done; one left RUNNING
    // by a process that died first is recovered by recoverStaleTasks after STALE_MS.
    void requeueInFlight(activeTaskId).catch((error) =>
      console.error("Could not requeue in-flight work", error)
    )
  }
  // Ahead of the handlers that exit the process: Next's own.
  process.prependListener("SIGINT", () => stop("SIGINT"))
  process.prependListener("SIGTERM", () => stop("SIGTERM"))
  console.log("newrole.it background work started: Google Sheet syncs, company names")
  void workerLoop(signal).catch((error) =>
    console.error("newrole.it background work stopped", error)
  )
}
