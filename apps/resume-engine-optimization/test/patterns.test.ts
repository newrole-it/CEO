import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { loadFollowups, loadPatternApplications } from "../src/server/applications/patterns-load"

/**
 * What the patterns and follow-ups read from the database (src/server/applications/
 * patterns-load.ts): for each application the CV it was sent with and that CV's newest match
 * score, a letter for the offer, the offer's work mode, publisher and age, the offer's evaluation;
 * deleted applications are left out.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `patterns-${Date.now()}`
const DAY = 86_400_000

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

async function makeJob(data: Record<string, unknown>) {
  counter += 1
  const key = `${stamp}-${counter}`
  const company = await db.company.create({
    data: { name: `Acme ${key}`, normalizedName: `acme-${key}` },
  })
  return db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      title: "Backend Engineer",
      normalizedTitle: "backend engineer",
      summary: "",
      descriptionText: "",
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
      ...data,
    },
  })
}

test("each application carries what it was sent with", async () => {
  const user = await db.user.create({ data: { email: `u-${stamp}@example.com`, role: "USER" } })
  const appliedAt = new Date(Date.now() - 30 * DAY)
  const job = await makeJob({
    workplaceType: "REMOTE",
    viaIntermediary: true,
    publishedAt: new Date(appliedAt.getTime() - 10 * DAY),
  })
  const tailored = await db.cvDocument.create({
    data: { userId: user.id, title: "Pod ofertę", jobId: job.id, content: {} },
  })
  await db.cvDocument.create({
    data: { userId: user.id, title: "List", jobId: job.id, docType: "LETTER", content: {} },
  })
  await db.matchRound.create({
    data: { userId: user.id, documentId: tailored.id, number: 1, notes: {}, score: 55 },
  })
  await db.matchRound.create({
    data: { userId: user.id, documentId: tailored.id, number: 2, notes: {}, score: 81 },
  })
  await db.offerEvaluation.create({
    data: {
      userId: user.id,
      jobId: job.id,
      decision: "consider",
      result: {},
      locale: "pl",
      offerHash: "x",
      offerOrigin: "full",
      profileHash: "y",
    },
  })
  const general = await db.cvDocument.create({
    data: { userId: user.id, title: "Ogólne", content: {} },
  })
  const withTailored = await db.application.create({
    data: {
      userId: user.id,
      jobId: job.id,
      company: "Acme",
      title: "Backend",
      cvDocumentId: tailored.id,
      appliedAt,
      statusChangedAt: appliedAt,
    },
  })
  const plain = await db.application.create({
    data: {
      userId: user.id,
      company: "Beta",
      title: "Backend",
      cvDocumentId: general.id,
      status: "REJECTED",
      appliedAt,
      statusChangedAt: appliedAt,
    },
  })
  await db.application.create({
    data: { userId: user.id, company: "Gone", title: "x", status: "DELETED" },
  })

  const rows = await loadPatternApplications(user.id)
  assert.equal(rows.length, 2, "a deleted application is left out")
  const first = rows.find((row) => row.id === withTailored.id)
  assert.deepEqual(
    first && {
      matchScore: first.matchScore,
      cv: first.cv,
      letter: first.letter,
      workplace: first.workplace,
      intermediary: first.intermediary,
      postingAgeDays: first.postingAgeDays,
      evaluation: first.evaluation,
    },
    {
      matchScore: 81,
      cv: "tailored",
      letter: true,
      workplace: "REMOTE",
      intermediary: true,
      postingAgeDays: 10,
      evaluation: "consider",
    }
  )
  const second = rows.find((row) => row.id === plain.id)
  assert.deepEqual(
    second && [second.cv, second.letter, second.workplace, second.evaluation, second.matchScore],
    ["general", null, null, null, null],
    "without an offer nothing about the offer is known"
  )

  // the APPLIED one, 30 days quiet, is cold; the rejected one is closed and needs nothing
  const followups = await loadFollowups(user.id)
  assert.deepEqual(
    followups.rows.map((row) => [row.id, row.state, row.suggestStatus]),
    [[withTailored.id, "cold", "GHOSTED"]]
  )
})
