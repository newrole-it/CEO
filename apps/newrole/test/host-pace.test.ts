import "./only-test-db"
import { after, test } from "node:test"
import assert from "node:assert/strict"
import db from "db"
import { reserveHostSlot } from "src/server/crawler/host-pace"

const host = `pace-${Date.now()}.example`

after(async () => {
  await db.authRateLimit.deleteMany({ where: { key: `host-pace:${host}` } })
  await db.$disconnect()
})

test("callers share one clock per host, as separate processes do", async () => {
  const now = Date.now()
  // Three reservations at the same moment, as from the worker, the web app and the MCP server.
  const waits = await Promise.all([0, 1, 2].map(() => reserveHostSlot(host, 5_000, now)))
  assert.deepEqual(
    [...waits].sort((a, b) => a - b),
    [0, 5_000, 10_000]
  )
})

test("a host left alone longer than the interval is free at once", async () => {
  const later = Date.now() + 60_000
  assert.equal(await reserveHostSlot(host, 5_000, later), 0)
  assert.equal(await reserveHostSlot(host, 5_000, later + 1_000), 4_000)
})
