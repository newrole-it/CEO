import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import {
  enqueueStaleSheetSyncs,
  SHEET_PULL_MS,
  SHEET_RETRY_MS,
} from "../src/server/applications/sheet"
import { SHEET_SYNC } from "../src/server/queue/enqueue"

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `sheetpull${Date.now()}`
const users: number[] = []

after(async () => {
  for (const userId of users) {
    await db.backgroundTask.deleteMany({
      where: { type: SHEET_SYNC, payload: { path: ["userId"], equals: userId } },
    })
  }
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

async function linked(name: string, data: { lastSyncedAt: Date; lastError: string | null }) {
  const user = await db.user.create({
    data: { email: `${name}-${stamp}@example.com`, role: "USER" },
  })
  users.push(user.id)
  await db.sheetLink.create({
    data: {
      userId: user.id,
      secret: stamp,
      webhookUrl: "https://script.google.com/macros/s/AKfy-test/exec",
      ...data,
    },
  })
  return user.id
}

async function queued(userId: number): Promise<number> {
  return db.backgroundTask.count({
    where: { type: SHEET_SYNC, status: "PENDING", payload: { path: ["userId"], equals: userId } },
  })
}

test("a sheet that failed is pulled again only after the retry wait, not every minute", async () => {
  const longAgo = new Date(Date.now() - 24 * 60 * 60_000)
  const working = await linked("working", { lastSyncedAt: longAgo, lastError: null })
  const failing = await linked("failing", {
    lastSyncedAt: longAgo,
    lastError: "script: Skrypt zgłosił błąd. (exception: x)",
  })

  const soon = new Date(Date.now() + SHEET_PULL_MS + 60_000)
  await enqueueStaleSheetSyncs(soon)
  assert.equal(await queued(working), 1)
  assert.equal(await queued(failing), 0)

  await enqueueStaleSheetSyncs(new Date(Date.now() + SHEET_RETRY_MS + 60_000))
  assert.equal(await queued(failing), 1)
})
