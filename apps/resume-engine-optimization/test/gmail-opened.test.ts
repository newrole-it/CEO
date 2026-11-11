import "./only-test-db"
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { applyOpenedMail, previewOpenedMail, type OpenedMail } from "../src/server/gmail/opened"
import { mailInbox, resolveMailEvent } from "../src/server/gmail/service"

/**
 * One message the person opened in Gmail and picked in the extension. Nothing here talks to
 * Google: the extension sends what the page shows, and nothing changes before the person confirms.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `gmail-opened-${Date.now()}`
const HOUR = 3_600_000
const BODY_SECRET = "TRESC-OTWARTEGO-MAILA"
let userId = 0
let otherId = 0
const appIds: Record<string, string> = {}

const invitation: OpenedMail = {
  messageId: "18f0a1b2c3d4e5f6",
  from: { address: "jane@acme.com", name: "Jane from Acme" },
  subject: "Acme: next steps for Head of Engineering",
  receivedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
  text: `Hi,\n\nWe would like to invite you to a technical interview for the Head of Engineering role. ${BODY_SECRET}\nhttps://acme.com/schedule?token=abc\n\nOn Mon someone wrote:\n> We regret to inform you`,
}

before(async () => {
  const user = await db.user.create({
    data: { email: `person-${stamp}@example.com`, role: "USER" },
  })
  const other = await db.user.create({
    data: { email: `other-${stamp}@example.com`, role: "USER" },
  })
  userId = user.id
  otherId = other.id
  const applied = new Date(Date.now() - 10 * 24 * HOUR)
  const add = async (key: string, company: string, title: string, url: string, status: string) => {
    const row = await db.application.create({
      data: {
        userId,
        company,
        title,
        url,
        status,
        appliedAt: applied,
        statusChangedAt: applied,
        source: "manual",
      },
    })
    appIds[key] = row.id
  }
  await add("acme", "Acme", "Head of Engineering", "https://careers.acme.com/jobs/1", "SCREENING")
  await add("globex", "Globex", "CTO", "https://jobs.lever.co/globex/abc", "APPLIED")
  await add("closed", "Initech", "Engineering Manager", "https://initech.pl/kariera/1", "REJECTED")
})

const status = async (key: string) =>
  (await db.application.findUniqueOrThrow({ where: { id: appIds[key] } })).status

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

test("the preview reads the message and suggests the application, and saves nothing", async () => {
  const preview = await previewOpenedMail(userId, invitation, { llm: null })
  assert.equal(preview.reading.signal, "INTERVIEW")
  assert.equal(preview.reading.reader, "rules")
  assert.equal(preview.suggestion.applicationId, appIds.acme)
  assert.equal(preview.suggestion.status, "INTERVIEW")
  assert.equal(preview.mail.messageId, invitation.messageId)
  // The likely one first, and a closed process can still be picked by hand.
  assert.equal(preview.choices[0].id, appIds.acme)
  assert.ok(preview.choices[0].likely)
  assert.ok(preview.choices.some((choice) => choice.id === appIds.closed && !choice.likely))
  assert.equal(preview.used, null)
  // The quoted thread below is not this message's news.
  assert.notEqual(preview.reading.signal, "REJECTED")

  assert.equal(await db.mailEvent.count({ where: { userId } }), 0)
  const acme = await db.application.findUniqueOrThrow({ where: { id: appIds.acme } })
  assert.equal(acme.status, "SCREENING")
})

test("saving changes the status the person chose and puts the subject on the timeline", async () => {
  const { text: _text, ...mail } = invitation
  const result = await applyOpenedMail(userId, {
    mail,
    applicationId: appIds.acme,
    status: "INTERVIEW",
    signal: "INTERVIEW",
    reader: "rules",
    evidence: "We would like to invite you to a technical interview",
  })
  assert.equal(result.status, "saved")
  const acme = await db.application.findUniqueOrThrow({
    where: { id: appIds.acme },
    include: { events: true },
  })
  assert.equal(acme.status, "INTERVIEW")
  const mailEvent = acme.events.find((event) => event.type === "mail")
  assert.equal(mailEvent?.note, invitation.subject)
  assert.equal(mailEvent?.channel, "gmail")

  const logged = await db.mailEvent.findUniqueOrThrow({
    where: { userId_messageId: { userId, messageId: invitation.messageId! } },
  })
  assert.equal(logged.outcome, "APPLIED")
  assert.equal(logged.fromStatus, "SCREENING")
  assert.equal(logged.toStatus, "INTERVIEW")
  const stored = JSON.stringify(await db.mailEvent.findMany({ where: { userId } }))
  assert.ok(!stored.includes(BODY_SECRET))

  // The tracker can undo it, like any change from mail.
  const inbox = await mailInbox(userId)
  assert.ok(inbox.recent.some((item) => item.id === logged.id))
  await resolveMailEvent({ userId, id: logged.id, action: "undo" })
  assert.equal(await status("acme"), "SCREENING")
})

test("the same message is not used twice", async () => {
  const { text: _text, ...mail } = invitation
  // Undone above, so it is free again; save it as a timeline note this time.
  const first = await applyOpenedMail(userId, {
    mail,
    applicationId: appIds.acme,
    status: null,
    signal: "INTERVIEW",
    reader: "rules",
  })
  assert.equal(first.status, "saved")
  if (first.status === "saved") assert.equal(first.changed, false)
  const second = await applyOpenedMail(userId, {
    mail,
    applicationId: appIds.globex,
    status: "REJECTED",
    signal: "REJECTED",
    reader: "rules",
  })
  assert.equal(second.status, "used")
  const preview = await previewOpenedMail(userId, invitation, { llm: null })
  assert.equal(preview.used?.applicationId, appIds.acme)
})

test("a message without an id gets a stable one, and a future date becomes now", async () => {
  const now = new Date()
  const mail: OpenedMail = {
    messageId: null,
    from: { address: "Globex Hiring <no-reply@hire.lever.co>", name: "Globex Hiring Team" },
    subject: "Your application to Globex",
    receivedAt: new Date(now.getTime() + 48 * HOUR).toISOString(),
    text: "Unfortunately, we have decided to move forward with other candidates.",
  }
  const first = await previewOpenedMail(userId, mail, { llm: null, now })
  const again = await previewOpenedMail(userId, mail, { llm: null, now })
  assert.match(first.mail.messageId, /^ext:[0-9a-f]{32}$/)
  assert.equal(first.mail.messageId, again.mail.messageId)
  assert.equal(first.mail.receivedAt, now.toISOString())
  assert.equal(first.reading.signal, "REJECTED")
})

test("another account's application cannot be picked", async () => {
  const { text: _text, ...mail } = invitation
  await assert.rejects(
    applyOpenedMail(otherId, {
      mail: { ...mail, messageId: "other-account" },
      applicationId: appIds.globex,
      status: "REJECTED",
      signal: "REJECTED",
      reader: "rules",
    }),
    /not found/i
  )
  assert.equal(await status("globex"), "APPLIED")
})
