import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { createCv } from "../src/server/cv/service"
import { keepOffer } from "../src/server/offers/service"
import { eraseProfile } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"
import { companyBrief, CompanyBriefError, getCompanyBrief } from "../src/server/research/service"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { LlmClient } from "@newrole/llm/common"

/**
 * The company brief (src/server/research/service.ts): a point from the offer stands only with a
 * quote found in the offer's text, the candidate's angle only with evidence in their own data;
 * the brief is kept per person and company and reopens without a model; without a model nothing
 * is written; erasing the profile removes it.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `research-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

const OFFER_TEXT = [
  "Senior Platform Engineer",
  "Budujemy platformę płatności dla sklepów internetowych w Europie Środkowej.",
  "Zespół pracuje w trybie code review i pisze testy do każdej zmiany.",
  "Wymagamy: Kubernetes w produkcji, PostgreSQL.",
].join("\n")

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
      title: "Senior Platform Engineer",
      normalizedTitle: "senior platform engineer",
      summary: "",
      descriptionText: "Budujemy platformę płatności.",
      locationText: "Polska",
      workplaceType: "REMOTE",
      publishedAt: new Date(),
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
    },
  })
}

const briefReply = {
  points: [
    {
      axis: "strategy",
      text: "Firma buduje platformę płatności dla sklepów.",
      quote: "Budujemy platformę płatności dla sklepów internetowych",
    },
    {
      axis: "culture",
      text: "Każda zmiana przechodzi code review.",
      quote: "Zespół pracuje w trybie code review",
    },
    // the offer does not say this: dropped
    {
      axis: "competitors",
      text: "Konkuruje z dużymi bankami.",
      quote: "Nasi konkurenci to największe banki w regionie",
    },
  ],
  angle: [
    {
      text: "Masz Kubernetes i PostgreSQL, o które prosi oferta.",
      offerQuote: "Kubernetes w produkcji, PostgreSQL",
      evidence: "Node.js, PostgreSQL, Kubernetes, API",
    },
    // evidence the person's data does not hold: dropped
    {
      text: "Prowadziłeś zespół dwudziestu osób.",
      offerQuote: "Senior Platform Engineer",
      evidence: "Kierowałem zespołem 20 inżynierów w banku",
    },
  ],
  questions: [{ text: "Jak wygląda proces code review?", quote: "code review" }],
}

function fakeLlm(reply: unknown): LlmClient & { purposes: string[] } {
  const llm = {
    model: "fake",
    purposes: [] as string[],
    async completeJson(args: Parameters<LlmClient["completeJson"]>[0]) {
      llm.purposes.push(args.purpose)
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  return llm as LlmClient & { purposes: string[] }
}

test("an offer that is not in the index has no brief", async () => {
  const user = await makeUser()
  await assert.rejects(
    companyBrief(user.id, "no-such-offer", { locale: "pl", llm: null }),
    (error: unknown) => error instanceof CompanyBriefError && error.code === "job-not-found"
  )
  assert.equal(await getCompanyBrief(user.id, "no-such-offer"), null)
})

test("without a model nothing is written: the records alone", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  const view = await companyBrief(user.id, job.id, { locale: "pl", llm: null, research: null })
  assert.equal(view.brief, null)
  assert.equal(await db.companyBrief.count({ where: { userId: user.id } }), 0)
})

test("a point stands only on a quote from the offer, the angle only on the person's data", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const llm = fakeLlm(briefReply)

  const view = await companyBrief(user.id, job.id, { locale: "pl", llm, research: null })
  assert.deepEqual(llm.purposes, ["company-brief"])
  const result = view.brief?.result
  assert.ok(result)
  assert.deepEqual(result.points.map((point) => point.axis).sort(), ["culture", "strategy"])
  for (const point of result.points) assert.equal(point.source.kind, "offer")
  assert.equal(result.dropped.offer, 1)
  assert.deepEqual(
    result.angle.map((point) => point.evidence),
    ["Node.js, PostgreSQL, Kubernetes, API"]
  )
  assert.equal(result.dropped.angle, 1)
  assert.equal(result.offer, "done")
  assert.equal(result.web.state, "provider", "a provider without web tools does no web research")
  assert.ok(view.unknown.includes("competitors"), "an axis nothing confirmed stays unknown")

  // it reopens without a model call, and is kept once per person and company
  const again = await getCompanyBrief(user.id, job.id)
  assert.deepEqual(again?.brief?.result.points, result.points)
  assert.equal(again?.brief?.stale, false)
  await companyBrief(user.id, job.id, { locale: "pl", llm, research: null })
  assert.equal(await db.companyBrief.count({ where: { userId: user.id } }), 1)

  // the person's export carries it, and erasing the profile removes it (it quotes the CV)
  const exported = await exportAccount(user.id)
  assert.equal((exported as { companyBriefs: unknown[] }).companyBriefs.length, 1)
  await eraseProfile(user.id)
  assert.equal(await db.companyBrief.count({ where: { userId: user.id } }), 0)
})
