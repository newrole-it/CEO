import { Prisma } from "@prisma/client"
import db from "db"

type Writer = Prisma.TransactionClient | typeof db

export const INDEX_WATCHED = "INDEX_WATCHED"
export const SHEET_SYNC = "SHEET_SYNC"
/** Brings in offers a cloud agent read while this computer was off (src/server/harvest). */
export const HARVEST_IMPORT = "HARVEST_IMPORT"
/** How often the worker looks for offers a cloud agent pushed to a harvest branch. */
export const HARVEST_CHECK_MS = 10 * 60 * 1000
/** No longer queued. The worker finishes a task left from before, and erasing removes it. */
export const GMAIL_SYNC = "GMAIL_SYNC"
/** Waits this long after a change so a burst of edits becomes one Google Sheet write. */
export const SHEET_SYNC_DELAY_MS = 20_000

/** Mirror the person's applications to their Google Sheet soon. A pending task is reused. */
export async function enqueueSheetSync(userId: number, client: Writer = db) {
  const pending = await client.backgroundTask.findFirst({
    where: { type: SHEET_SYNC, status: "PENDING", payload: { path: ["userId"], equals: userId } },
    select: { id: true },
  })
  if (pending) return
  await client.backgroundTask.create({
    data: {
      type: SHEET_SYNC,
      payload: { userId },
      status: "PENDING",
      maxAttempts: 2,
      runAt: new Date(Date.now() + SHEET_SYNC_DELAY_MS),
    },
  })
}

export async function enqueueSearch(searchRunId: string, client: Writer = db) {
  await client.backgroundTask.create({
    data: {
      type: "RUN_SEARCH",
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
