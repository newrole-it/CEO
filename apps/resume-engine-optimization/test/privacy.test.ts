import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { eraseAccount, eraseProfile } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `privacy-${Date.now()}`
const phrase = `Head of Privacy ${stamp}`

async function cleanup() {
  await db.backgroundTask.deleteMany({ where: { lastError: { contains: phrase } } })
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.auditEvent.deleteMany({ where: { action: `PRIVACY_${stamp}` } })
  await db.llmCache.deleteMany({ where: { cacheKey: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: `privacy-co-${stamp}` } })
  await db.authRateLimit.deleteMany({ where: { key: { contains: stamp } } })
  await db.loginLink.deleteMany({ where: { email: { contains: stamp } } })
}

after(async () => {
  await cleanup()
  await db.$disconnect()
})

test("profile deletion and account deletion remove personal data", async () => {
  const email = `person-${stamp}@example.com`
  const user = await db.user.create({
    data: {
      email,
      name: "Privacy Person",
      role: "USER",
      hashedPassword: `hashed-secret-${stamp}`,
      linkedinSub: `li-${stamp}`,
      imageUrl: `https://example.com/${stamp}.jpg`,
    },
  })
  const other = await db.user.create({
    data: { email: `other-${stamp}@example.com`, role: "USER" },
  })
  await db.candidateProfile.create({
    data: {
      userId: user.id,
      headline: `Headline ${stamp}`,
      currentTitle: "Engineer",
      linkedinDocument: { blocks: [{ id: "about", parts: [{ field: "text", text: phrase }] }] },
    },
  })
  await db.profileAuditRun.create({
    data: {
      userId: user.id,
      score: 40,
      summary: `Audit mentions ${phrase}`,
      topChanges: [],
      annotations: [],
      demand: [],
      documentHash: `doc-${stamp}`,
    },
  })
  const search = await db.savedSearch.create({
    data: {
      userId: user.id,
      name: phrase,
      phrase,
      locationHint: "Poland",
      targetTitles: [],
      includedKeywords: [],
      excludedKeywords: [],
      seniority: [],
    },
  })
  const run = await db.searchRun.create({
    data: { savedSearchId: search.id, status: "SUCCEEDED", message: phrase },
  })
  const company = await db.company.create({
    data: { name: `Privacy Co ${stamp}`, normalizedName: `privacy-co-${stamp}` },
  })
  const job = await db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      title: "Engineer",
      normalizedTitle: "engineer",
      summary: "A public posting",
      descriptionText: "A public posting",
      originalUrl: `https://example.com/jobs/${stamp}`,
      canonicalUrl: `https://example.com/jobs/${stamp}`,
      contentHash: `hash-${stamp}`,
      identityKey: `job-${stamp}`,
      fingerprint: `fp-${stamp}`,
    },
  })
  await db.jobMatch.create({
    data: {
      jobId: job.id,
      savedSearchId: search.id,
      searchRunId: run.id,
      score: 70,
      scoreBreakdown: {},
      reason: `Because ${phrase}`,
      interestedAt: new Date(),
    },
  })
  await db.searchLog.create({
    data: { searchRunId: run.id, message: `Expanded “${phrase}” with a checked example.` },
  })
  await db.discoveryRun.create({
    data: { searchRunId: run.id, query: `site:jobs.lever.co ${phrase}`, status: "SUCCEEDED" },
  })
  await db.backgroundTask.create({
    data: {
      type: "RUN_SEARCH",
      payload: { searchRunId: run.id },
      status: "PENDING",
      lastError: `failed while expanding ${phrase}`,
    },
  })
  await db.auditEvent.create({
    data: {
      userId: user.id,
      action: `PRIVACY_${stamp}`,
      metadata: { phrase, searchId: search.id },
    },
  })
  await db.session.create({
    data: {
      userId: user.id,
      handle: `handle-${stamp}`,
      hashedSessionToken: `session-secret-${stamp}`,
      publicData: JSON.stringify({ userId: user.id }),
    },
  })
  await db.token.create({
    data: {
      userId: user.id,
      hashedToken: `token-${stamp}`,
      type: "RESET_PASSWORD",
      expiresAt: new Date(Date.now() + 60_000),
      sentTo: email,
    },
  })
  await db.loginLink.create({
    data: {
      email,
      hashedToken: `link-${stamp}`,
      expiresAt: new Date(Date.now() + 60_000),
      requestIp: "203.0.113.10",
    },
  })
  await db.authRateLimit.create({
    data: { key: `email:${email}`, windowStart: new Date(), count: 1 },
  })
  await db.authRateLimit.create({
    data: { key: `search:${user.id}`, windowStart: new Date(), count: 1 },
  })
  await db.llmCache.create({
    data: {
      cacheKey: `cv-${stamp}`,
      purpose: "profile-audit",
      model: "test",
      response: { summary: phrase },
      userId: user.id,
    },
  })
  await db.llmCache.create({
    data: {
      cacheKey: `expand-${stamp}`,
      purpose: "query-expansion",
      model: "test",
      response: { text: phrase },
      userId: user.id,
    },
  })
  await db.llmCache.create({
    data: {
      cacheKey: `other-${stamp}`,
      purpose: "profile-audit",
      model: "test",
      response: { summary: "someone else" },
      userId: other.id,
    },
  })
  const otherSearch = await db.savedSearch.create({
    data: {
      userId: other.id,
      name: "Other role",
      phrase: "Other role",
      targetTitles: [],
      includedKeywords: [],
      excludedKeywords: [],
      seniority: [],
    },
  })

  const exported = await exportAccount(user.id)
  const exportedJson = JSON.stringify(exported)
  assert.equal(exported?.profile?.headline, `Headline ${stamp}`)
  assert.equal(exported?.searches[0]?.phrase, phrase)
  assert.equal(exported?.searches[0]?.runs[0]?.matches[0]?.interestedAt != null, true)
  assert.equal(exportedJson.includes(`hashed-secret-${stamp}`), false)
  assert.equal(exportedJson.includes(`session-secret-${stamp}`), false)
  assert.equal(exportedJson.includes(`link-${stamp}`), false)

  await eraseProfile(user.id)
  assert.equal(await db.candidateProfile.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.profileAuditRun.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.llmCache.count({ where: { cacheKey: `cv-${stamp}` } }), 0)
  assert.equal(await db.llmCache.count({ where: { cacheKey: `expand-${stamp}` } }), 1)
  assert.equal(await db.savedSearch.count({ where: { id: search.id } }), 1)
  assert.equal(await db.user.count({ where: { id: user.id } }), 1)

  await eraseAccount(user.id)
  assert.equal(await db.user.count({ where: { id: user.id } }), 0)
  assert.equal(await db.savedSearch.count({ where: { id: search.id } }), 0)
  assert.equal(await db.jobMatch.count({ where: { savedSearchId: search.id } }), 0)
  assert.equal(await db.searchLog.count({ where: { message: { contains: phrase } } }), 0)
  assert.equal(await db.discoveryRun.count({ where: { query: { contains: phrase } } }), 0)
  assert.equal(await db.session.count({ where: { handle: `handle-${stamp}` } }), 0)
  assert.equal(await db.token.count({ where: { hashedToken: `token-${stamp}` } }), 0)
  assert.equal(await db.loginLink.count({ where: { email } }), 0)
  assert.equal(
    await db.authRateLimit.count({
      where: { key: { in: [`email:${email}`, `search:${user.id}`] } },
    }),
    0
  )
  assert.equal(
    await db.llmCache.count({ where: { cacheKey: { in: [`cv-${stamp}`, `expand-${stamp}`] } } }),
    0
  )
  const tasks = await db.backgroundTask.findMany({
    where: { lastError: { contains: phrase } },
  })
  assert.equal(tasks.length, 0)
  const event = await db.auditEvent.findFirst({ where: { action: `PRIVACY_${stamp}` } })
  assert.equal(event?.userId ?? null, null)
  assert.equal(event?.metadata ?? null, null)
  assert.equal(JSON.stringify(event).includes(phrase), false)

  assert.equal(await db.savedSearch.count({ where: { id: otherSearch.id } }), 1)
  assert.equal(await db.llmCache.count({ where: { cacheKey: `other-${stamp}` } }), 1)
  assert.equal(await db.user.count({ where: { id: other.id } }), 1)
  assert.equal(await db.job.count({ where: { id: job.id } }), 1)
})
