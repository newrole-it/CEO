import "./only-test-db"
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { sealToken } from "../src/server/gmail/token-crypto"
import {
  disconnectGmail,
  gmailStatus,
  mailInbox,
  resolveMailEvent,
  revokeGmailAccess,
} from "../src/server/gmail/service"
import { eraseAccount } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"

/**
 * A mailbox connected before Gmail stopped being searched, and the log it left behind. The rows
 * are written here directly, the way the old sync left them: nothing reads the mailbox any more.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `gmail-${Date.now()}`
const REFRESH = `1//refresh-${stamp}`
const MAILBOX = `me-${stamp}@example.com`
const HOUR = 3_600_000

/** Google's revoke endpoint, the only call left. Anything else fails the test. */
function fakeGoogle() {
  const calls: string[] = []
  const revoked: string[] = []
  const fetchImpl = async (input: string, init?: RequestInit) => {
    calls.push(input)
    const url = new URL(input)
    assert.equal(url.hostname, "oauth2.googleapis.com")
    assert.equal(url.pathname, "/revoke")
    revoked.push(String((init?.body as URLSearchParams).get("token")))
    return { ok: true, status: 200, json: async () => ({}) }
  }
  return { calls, revoked, fetchImpl }
}

async function connect(id: number, email: string, refreshToken: string) {
  const sealed = sealToken(refreshToken, id)
  assert.ok(sealed, "SESSION_SECRET_KEY is missing")
  await db.gmailLink.create({ data: { userId: id, email, refreshToken: sealed } })
}

let userId = 0
const appIds: Record<string, string> = {}

before(async () => {
  const user = await db.user.create({
    data: { email: `person-${stamp}@example.com`, role: "USER" },
  })
  userId = user.id
  const applied = new Date(Date.now() - 10 * 24 * HOUR)
  const add = async (key: string, company: string, title: string, status = "APPLIED") => {
    const row = await db.application.create({
      data: {
        userId,
        company,
        title,
        status,
        appliedAt: applied,
        statusChangedAt: applied,
        source: "manual",
        events: { create: [{ type: "created", toStatus: status, channel: "web", at: applied }] },
      },
    })
    appIds[key] = row.id
  }
  // Acme's rejection was applied on its own; the rest wait for the person.
  await add("acme", "Acme", "Head of Engineering", "REJECTED")
  await add("globex", "Globex", "CTO", "SCREENING")
  await add("initech", "Initech", "Engineering Manager")
  await add("umbrella", "Umbrella", "VP Engineering")
  await add("stark", "Stark", "Director")
  await connect(userId, MAILBOX, REFRESH)

  const log = (
    messageId: string,
    hoursAgo: number,
    data: {
      applicationId?: string
      signal: string
      outcome: string
      fromStatus?: string
      toStatus?: string
      company?: string
      title?: string
    }
  ) => ({
    userId,
    messageId,
    fromAddress: `hr@${messageId}.example.com`,
    subject: `Mail ${messageId}`,
    receivedAt: new Date(Date.now() - hoursAgo * HOUR),
    reader: "rules",
    ...data,
  })
  await db.mailEvent.createMany({
    data: [
      log("rejection", 5, {
        applicationId: appIds.acme,
        signal: "REJECTED",
        outcome: "APPLIED",
        fromStatus: "APPLIED",
        toStatus: "REJECTED",
      }),
      log("forged", 4, {
        applicationId: appIds.initech,
        signal: "REJECTED",
        outcome: "PENDING",
        toStatus: "REJECTED",
      }),
      log("offer", 3, {
        applicationId: appIds.umbrella,
        signal: "OFFER",
        outcome: "PENDING",
        toStatus: "OFFER",
      }),
      log("new-confirmation", 2, {
        signal: "CONFIRMATION",
        outcome: "PENDING",
        company: "Hooli",
        title: "Staff Engineer",
      }),
      log("unclear", 1, {
        applicationId: appIds.stark,
        signal: "REJECTED",
        outcome: "PENDING",
        toStatus: "REJECTED",
      }),
    ],
  })
})

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

const status = async (key: string) =>
  (await db.application.findUniqueOrThrow({ where: { id: appIds[key] } })).status

const eventFor = async (messageId: string) =>
  db.mailEvent.findUniqueOrThrow({ where: { userId_messageId: { userId, messageId } } })

test("the token is sealed and stays out of the export and the status", async () => {
  const link = await db.gmailLink.findUniqueOrThrow({ where: { userId } })
  assert.ok(!link.refreshToken.includes("refresh"), "stored in the clear")
  const exported = JSON.stringify(await exportAccount(userId))
  assert.ok(!exported.includes(link.refreshToken))
  assert.ok(!exported.includes(REFRESH))
  assert.ok(!JSON.stringify(await gmailStatus(userId)).includes(link.refreshToken))
})

test("the person can undo, apply and dismiss", async () => {
  const inbox = await mailInbox(userId)
  assert.ok(inbox.recent.some((item) => item.application?.id === appIds.acme))
  assert.deepEqual(
    inbox.pending.map((item) => item.subject),
    ["forged", "offer", "new-confirmation", "unclear"].map((id) => `Mail ${id}`)
  )

  const confirmation = await eventFor("new-confirmation")
  const added = await resolveMailEvent({ userId, id: confirmation.id, action: "apply" })
  assert.equal(added.created, true)
  assert.equal(added.application?.company, "Hooli")
  assert.equal(added.application?.title, "Staff Engineer")
  assert.equal(added.application?.source, "gmail")
  assert.equal((await eventFor("new-confirmation")).outcome, "CREATED")

  const undo = await eventFor("rejection")
  const undone = await resolveMailEvent({ userId, id: undo.id, action: "undo" })
  assert.equal(undone.application?.status, "APPLIED")
  assert.equal((await eventFor("rejection")).outcome, "UNDONE")
  await assert.rejects(resolveMailEvent({ userId, id: undo.id, action: "undo" }))

  const forged = await eventFor("forged")
  const applied = await resolveMailEvent({ userId, id: forged.id, action: "apply" })
  assert.equal(applied.application?.status, "REJECTED")
  assert.equal((await eventFor("forged")).outcome, "APPLIED")

  const offer = await eventFor("offer")
  await resolveMailEvent({ userId, id: offer.id, action: "dismiss" })
  assert.equal((await eventFor("offer")).outcome, "DISMISSED")
  assert.equal(await status("umbrella"), "APPLIED")
})

test("another account cannot touch these messages", async () => {
  const other = await db.user.create({
    data: { email: `other-${stamp}@example.com`, role: "USER" },
  })
  const event = await eventFor("unclear")
  await assert.rejects(resolveMailEvent({ userId: other.id, id: event.id, action: "apply" }))
  await assert.rejects(
    resolveMailEvent({
      userId,
      id: event.id,
      action: "apply",
      applicationId: (
        await db.application.create({
          data: { userId: other.id, company: "X", title: "Y", source: "manual" },
        })
      ).id,
    })
  )
  assert.equal((await eventFor("unclear")).outcome, "PENDING")
  assert.equal((await mailInbox(other.id)).pending.length, 0)
})

test("a sealed token from another secret is not sent anywhere", async () => {
  const link = await db.gmailLink.findUniqueOrThrow({ where: { userId } })
  await db.gmailLink.update({
    where: { userId },
    data: {
      refreshToken: sealToken("x", userId, {
        SESSION_SECRET_KEY: "some-other-secret-long-enough-to-use-it",
      })!,
    },
  })
  const google = fakeGoogle()
  assert.equal(await revokeGmailAccess(userId, google.fetchImpl), false)
  assert.equal(google.calls.length, 0)
  await db.gmailLink.update({ where: { userId }, data: { refreshToken: link.refreshToken } })
})

test("disconnecting revokes at Google and wipes the log, not the tracker", async () => {
  const google = fakeGoogle()
  const { revoked } = await disconnectGmail(userId, google.fetchImpl)
  assert.equal(revoked, true)
  assert.deepEqual(google.revoked, [REFRESH])
  assert.equal(await db.gmailLink.count({ where: { userId } }), 0)
  assert.equal(await db.mailEvent.count({ where: { userId } }), 0)
  assert.equal(await status("globex"), "SCREENING")
  assert.equal((await gmailStatus(userId)).connected, false)
})

test("deleting the account revokes the grant and removes everything", async () => {
  const user = await db.user.create({ data: { email: `erase-${stamp}@example.com`, role: "USER" } })
  await connect(user.id, `erase-${stamp}@example.com`, `${REFRESH}-b`)
  await db.backgroundTask.create({
    data: { type: "GMAIL_SYNC", payload: { userId: user.id }, status: "PENDING" },
  })
  const original = globalThis.fetch
  const google = fakeGoogle()
  globalThis.fetch = google.fetchImpl as unknown as typeof fetch
  try {
    await eraseAccount(user.id)
  } finally {
    globalThis.fetch = original
  }
  assert.deepEqual(google.revoked, [`${REFRESH}-b`])
  assert.equal(await db.gmailLink.count({ where: { userId: user.id } }), 0)
  assert.equal(
    await db.backgroundTask.count({
      where: { type: "GMAIL_SYNC", payload: { path: ["userId"], equals: user.id } },
    }),
    0
  )
})
