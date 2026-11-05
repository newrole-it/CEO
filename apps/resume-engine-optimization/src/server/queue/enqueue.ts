import { Prisma } from "@prisma/client"
import db from "db"

type Writer = Prisma.TransactionClient | typeof db

export const SHEET_SYNC = "SHEET_SYNC"
/** No longer queued. The worker finishes a task left from before, and erasing removes it. */
export const GMAIL_SYNC = "GMAIL_SYNC"
/** Waits this long after a change so a burst of edits becomes one Google Sheet write. */
export const SHEET_SYNC_DELAY_MS = 20_000

/** The task types newrole.it's worker runs. Tasks of the offer index (@newrole/job-index) are not its. */
export const APP_TASKS = [SHEET_SYNC, GMAIL_SYNC] as const

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
