import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { createCv } from "../src/server/cv/service"
import { offerFit, quickTailorSettled, startQuickTailor } from "../src/server/offers/quick-tailor"
import { listOffers } from "../src/server/offers/service"
import type { LlmClient } from "@newrole/llm/common"
import { syntheticCv } from "@newrole/cv-core/fixtures"

/**
 * "Dopasuj CV" from the Chrome extension (src/server/offers/quick-tailor.ts): the offer behind an
 * address is added to the person's, the run goes on after the start has answered, and the panel's
 * question gets the run's steps and then the CV with its match.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `quick-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

async function makeUser() {
  counter += 1
  return db.user.create({ data: { email: `u${counter}-${stamp}@example.com`, role: "USER" } })
}

async function makeJob() {
  counter += 1
  const key = `${stamp}-${counter}`
  const company = await db.company.create({
    data: { name: `Acme ${key}`, normalizedName: `acme-${key}` },
  })
  return db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      title: "Staff Engineer",
      normalizedTitle: "staff engineer",
      summary: "",
      descriptionText: "Szukamy osoby, która zna się na platformach. Wymagamy Go.",
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
    },
  })
}

const tailorReply = {
  headline: "Platform Engineering Lead",
  sections: [{ id: "profile", body: "Buduję platformy dla dużych zespołów." }],
  changes: ["Ustawiłem profil pod platformy."],
  gaps: ["Go"],
}

/** A model that gives the same reply to every call, once `release` lets it answer. */
function heldLlm(reply: unknown): LlmClient & { calls: number; release: () => void } {
  let release = () => undefined as void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const llm = {
    model: "fake",
    calls: 0,
    release,
    async completeJson(args: Parameters<LlmClient["completeJson"]>[0]) {
      llm.calls += 1
      await gate
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  return llm as LlmClient & { calls: number; release: () => void }
}

test("an address that is no link starts nothing", async () => {
  const user = await makeUser()
  const start = await startQuickTailor({ userId: user.id, url: "   ", locale: "pl", llm: null })
  assert.deepEqual(start, { kind: "invalid" })
})

test("an offer nobody added is not the person's", async () => {
  const user = await makeUser()
  const job = await makeJob()
  assert.deepEqual(await offerFit(user.id, { url: job.originalUrl }), {
    offer: null,
    cv: null,
    run: null,
  })
})

test("the start adds the offer, the run goes on after it, and the panel gets the CV", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const llm = heldLlm(tailorReply)

  const start = await startQuickTailor({
    userId: user.id,
    url: job.originalUrl,
    locale: "pl",
    llm,
  })
  assert.deepEqual(start, { kind: "started", jobId: job.id })
  assert.deepEqual(
    (await listOffers(user.id)).map((offer) => offer.jobId),
    [job.id],
    "the offer is in the person's list before the run ends"
  )

  const during = await offerFit(user.id, { url: job.originalUrl })
  assert.equal(during.offer?.jobId, job.id)
  assert.equal(during.offer?.path, `/offers/${job.id}`)
  assert.equal(during.cv, null)
  assert.equal(during.run?.state, "running")

  // a second click, or a second tab, joins the run
  const again = await startQuickTailor({
    userId: user.id,
    url: job.originalUrl,
    locale: "pl",
    llm,
  })
  assert.deepEqual(again, { kind: "running", jobId: job.id })

  llm.release()
  await quickTailorSettled(user.id, job.id)

  const done = await offerFit(user.id, { url: job.originalUrl })
  assert.equal(done.run, null)
  assert.ok(done.cv, "the CV written for the offer")
  assert.equal(done.cv.path, `/cv/${done.cv.id}`)
  assert.equal(done.cv.matchPath, `/offers/${job.id}/match`)
  assert.ok(done.cv.summary, "its match in short")
  assert.equal(typeof done.cv.summary.required.total, "number")
  const stored = await db.cvDocument.findUniqueOrThrow({ where: { id: done.cv.id } })
  assert.equal(stored.jobId, job.id)
  assert.equal(stored.userId, user.id)

  // the offer's id finds it as well as its address
  const byId = await offerFit(user.id, { url: "https://example.com/elsewhere", jobId: job.id })
  assert.equal(byId.cv?.id, done.cv.id)

  // nothing is written twice
  const calls = llm.calls
  const after = await startQuickTailor({ userId: user.id, url: job.originalUrl, locale: "pl", llm })
  assert.deepEqual(after, { kind: "ready", jobId: job.id })
  assert.equal(llm.calls, calls)
})

test("a run that fails says why, and the next start runs again", async () => {
  const user = await makeUser()
  const job = await makeJob()
  // no CV and no profile to start from

  const start = await startQuickTailor({
    userId: user.id,
    url: job.originalUrl,
    locale: "en",
    llm: heldLlm(tailorReply),
  })
  assert.equal(start.kind, "started")
  await quickTailorSettled(user.id, job.id)

  const failed = await offerFit(user.id, { url: job.originalUrl })
  assert.equal(failed.cv, null)
  assert.equal(failed.run?.state, "failed")
  assert.equal(failed.run?.error, "no-base")

  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Main" })
  const llm = heldLlm(tailorReply)
  llm.release()
  const retry = await startQuickTailor({ userId: user.id, url: job.originalUrl, locale: "en", llm })
  assert.equal(retry.kind, "started")
  await quickTailorSettled(user.id, job.id)
  const done = await offerFit(user.id, { url: job.originalUrl })
  assert.equal(done.run, null)
  assert.ok(done.cv)
})

test("another person's offer and CV stay theirs", async () => {
  const [anna, ben] = await Promise.all([makeUser(), makeUser()])
  const job = await makeJob()
  await createCv({ userId: anna.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const llm = heldLlm(tailorReply)
  llm.release()
  await startQuickTailor({ userId: anna.id, url: job.originalUrl, locale: "pl", llm })
  await quickTailorSettled(anna.id, job.id)

  assert.ok((await offerFit(anna.id, { url: job.originalUrl })).cv)
  assert.deepEqual(await offerFit(ben.id, { url: job.originalUrl, jobId: job.id }), {
    offer: null,
    cv: null,
    run: null,
  })
})
