import { Prisma } from "@prisma/client"
import db from "./db"

type Writer = Prisma.TransactionClient | typeof db

/** The engine's background tasks, in the BackgroundTask table its worker (worker.ts) claims. */
export const RUN_SEARCH = "RUN_SEARCH"
export const INDEX_WATCHED = "INDEX_WATCHED"
/** Brings in offers a cloud agent read while this computer was off (harvest/). */
export const HARVEST_IMPORT = "HARVEST_IMPORT"
/** How often the worker looks for offers a cloud agent pushed to a harvest branch. */
export const HARVEST_CHECK_MS = 10 * 60 * 1000

/** Every task type this worker runs; another app's worker leaves them alone. */
export const INDEX_TASKS = [RUN_SEARCH, INDEX_WATCHED, HARVEST_IMPORT] as const

export async function enqueueSearch(searchRunId: string, client: Writer = db) {
  await client.backgroundTask.create({
    data: {
      type: RUN_SEARCH,
      payload: { searchRunId },
      status: "PENDING",
      runAt: new Date(),
    },
  })
}

/** Index one watched company's career page soon. A pending task for the same page is reused. */
export async function enqueueIndexWatched(careerPageId: string, client: Writer = db) {
  const pending = await client.backgroundTask.findFirst({
    where: {
      type: INDEX_WATCHED,
      status: { in: ["PENDING", "RUNNING"] },
      payload: { path: ["careerPageId"], equals: careerPageId },
    },
    select: { id: true },
  })
  if (pending) return
  await client.backgroundTask.create({
    data: {
      type: INDEX_WATCHED,
      payload: { careerPageId },
      status: "PENDING",
      maxAttempts: 2,
      runAt: new Date(),
    },
  })
}

/** Look at the harvest branches soon. A pending or running check is reused. */
export async function enqueueHarvestImport(client: Writer = db): Promise<boolean> {
  const pending = await client.backgroundTask.findFirst({
    where: { type: HARVEST_IMPORT, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  })
  if (pending) return false
  await client.backgroundTask.create({
    data: {
      type: HARVEST_IMPORT,
      payload: {},
      status: "PENDING",
      maxAttempts: 1,
      runAt: new Date(),
    },
  })
  return true
}
