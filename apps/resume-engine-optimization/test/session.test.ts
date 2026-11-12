import "./only-test-db"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { createSessionToken, hash256, readSession } from "../src/server/auth/session"

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `session-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

/** A session row and its cookie, the way @blitzjs/auth 3.0.2 wrote them (createNewSession). */
async function blitzSession(userId: number, handle: string, expiresAt: Date | null) {
  const publicData = JSON.stringify({ userId, role: "USER" })
  const sha = (text: string) => createHash("sha256").update(text).digest("hex")
  const token = Buffer.from([handle, "x".repeat(32), sha(publicData), "v0"].join(";")).toString(
    "base64"
  )
  await db.session.create({
    data: {
      handle,
      userId,
      expiresAt,
      hashedSessionToken: sha(token),
      antiCSRFToken: "y".repeat(32),
      publicData,
      privateData: "{}",
    },
  })
  return token
}

test("a session Blitz made is read as the same user", async () => {
  const user = await db.user.create({ data: { email: `a-${stamp}@example.com` } })
  const later = new Date(Date.now() + 86_400_000)
  const token = await blitzSession(user.id, `${stamp}-a:ots`, later)
  const session = await readSession(token)
  assert.deepEqual(session?.publicData, { userId: user.id, role: "USER" })
  assert.equal(session?.handle, `${stamp}-a:ots`)
})

test("a cookie that does not match its row, an expired one and a stranger are refused", async () => {
  const user = await db.user.create({ data: { email: `b-${stamp}@example.com` } })
  const later = new Date(Date.now() + 86_400_000)
  const token = await blitzSession(user.id, `${stamp}-b:ots`, later)
  // same handle, another id: the row's hash is of the real cookie
  const [handle, , hashed, version] = Buffer.from(token, "base64").toString().split(";")
  const forged = Buffer.from([handle, "z".repeat(32), hashed, version].join(";")).toString("base64")
  assert.equal(await readSession(forged), null)

  const expired = await blitzSession(user.id, `${stamp}-c:ots`, new Date(Date.now() - 1000))
  assert.equal(await readSession(expired), null)

  assert.equal(await readSession(createSessionToken(`${stamp}-none:ots`, "{}")), null)
  assert.equal(await readSession("not base64 at all"), null)
  assert.equal(await readSession(undefined), null)
})

test("a token of another version is refused", async () => {
  const user = await db.user.create({ data: { email: `d-${stamp}@example.com` } })
  const handle = `${stamp}-d:ots`
  const token = Buffer.from([handle, "x".repeat(32), "h", "v1"].join(";")).toString("base64")
  await db.session.create({
    data: {
      handle,
      userId: user.id,
      hashedSessionToken: hash256(token),
      publicData: JSON.stringify({ userId: user.id, role: "USER" }),
    },
  })
  assert.equal(await readSession(token), null)
})
