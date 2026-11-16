import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { createCv, updateCv } from "../src/server/cv/service"
import {
  evaluateOffer,
  evaluationSummary,
  EvaluationError,
  getEvaluation,
} from "../src/server/evaluation/service"
import { keepOffer, updateOffer } from "../src/server/offers/service"
import { eraseProfile } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"
import type { StepUpdate } from "@newrole/cv-core/progress"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { LlmClient } from "@newrole/llm/common"

/**
 * "Is it worth applying" (src/server/evaluation/service.ts): an offer is evaluated against the
 * person's default CV and profile, with a model and without one, the result is kept in place of
 * the one before, and the kept one says when the CV, the offer or the profile changed since.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `evaluation-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

const OFFER_TEXT = [
  "Senior Platform Engineer",
  "Wymagamy: Kubernetes w produkcji, PostgreSQL. Mile widziane: Terraform.",
  "Wynagrodzenie: 22 000 - 27 000 PLN netto / mies.",
  "Szukamy osoby, która lubi wear many hats.",
].join("\n")

async function makeUser(profile: Record<string, unknown> | null) {
  counter += 1
  const user = await db.user.create({
    data: { email: `u${counter}-${stamp}@example.com`, role: "USER" },
  })
  if (profile) await db.candidateProfile.create({ data: { userId: user.id, ...profile } })
  return user
}

async function makeJob(data: Record<string, unknown> = {}) {
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
      descriptionText: "Wymagamy Kubernetes.",
      locationText: "Polska",
      workplaceType: "REMOTE",
      salaryMin: 22000,
      salaryMax: 27000,
      salaryCurrency: "PLN",
      publishedAt: new Date(),
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
      ...data,
    },
  })
}

const PROFILE = {
  seniority: "senior",
  salaryFloor: 20000,
  salaryTarget: 25000,
  salaryCurrency: "PLN",
  salaryPeriod: "month",
  salaryContract: "b2b",
  remotePreference: "remote",
  homeCity: "Łódź",
}

const analysisReply = {
  role: "Buduje platformę.",
  seniority: "Senior",
  requirements: [
    { text: "Kubernetes w produkcji", importance: "required", kind: "tool", keyword: "Kubernetes" },
    { text: "PostgreSQL", importance: "required", kind: "tool", keyword: "PostgreSQL" },
    { text: "Terraform", importance: "preferred", kind: "tool", keyword: "Terraform" },
  ],
  keywords: [{ term: "Kubernetes", type: "hard", importance: "required" }],
  responsibilities: [],
  redFlags: [
    { quote: "wear many hats", why: "Jedna osoba na kilka ról." },
    { quote: "this phrase is not in the offer", why: "Wymyślone." },
  ],
  signals: [],
}

const matchReply = {
  requirements: [
    {
      id: "r1",
      status: "met",
      evidence: "Node.js, PostgreSQL, Kubernetes, API",
      note: "Zacznij od tego.",
    },
    // evidence the person's data does not hold: code turns "met" into "partial"
    { id: "r2", status: "met", evidence: "Dziesięć lat administrowania PostgreSQL w banku" },
    { id: "r3", status: "missing", gap: "minor", note: "Pokaż pokrewne narzędzia." },
  ],
  strengths: [],
  emphasize: ["Zacznij od platformy."],
  talkingPoints: [],
}

/** A model that answers each step by its purpose and counts the calls. */
function fakeLlm(replies: Record<string, unknown>): LlmClient & { purposes: string[] } {
  const llm = {
    model: "fake",
    purposes: [] as string[],
    async completeJson(args: Parameters<LlmClient["completeJson"]>[0]) {
      llm.purposes.push(args.purpose)
      const reply = replies[args.purpose]
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  return llm as LlmClient & { purposes: string[] }
}

test("an offer that is not in the index cannot be evaluated", async () => {
  const user = await makeUser(null)
  await assert.rejects(
    evaluateOffer(user.id, "no-such-offer", { locale: "pl", llm: null }),
    (error: unknown) => error instanceof EvaluationError && error.code === "job-not-found"
  )
  assert.equal(await getEvaluation(user.id, "no-such-offer"), null)
})

test("with a model: every dimension is scored by code and the result is kept", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  const cv = await createCv({
    userId: user.id,
    from: "content",
    content: syntheticCv(2),
    title: "Główne",
  })
  const llm = fakeLlm({ "offer-analysis": analysisReply, "cv-match": matchReply })
  const steps: StepUpdate[] = []

  const view = await evaluateOffer(user.id, job.id, {
    locale: "pl",
    llm,
    onStep: (update) => steps.push(update),
  })
  assert.deepEqual(llm.purposes, ["offer-analysis", "cv-match"])
  assert.deepEqual(
    steps.map((update) => `${update.step}:${update.state}`),
    ["offer:running", "offer:done", "match:running", "match:done"]
  )
  const { evaluation } = view
  const { dimensions } = evaluation

  // required: one met, one partial of two = 75 %; preferred: 0 of 1; 75 × 0.7 + 0 × 0.3 = 53
  assert.equal(dimensions.requirements.score, 53)
  assert.equal(dimensions.requirements.reason, "scored")
  const second = evaluation.report?.requirements.find((item) => item.id === "r2")
  assert.equal(
    second?.status,
    "partial",
    "evidence that is not in the person's data does not count"
  )
  assert.deepEqual(
    evaluation.gaps.map((gap) => [gap.id, gap.status, gap.level]),
    [["r2", "partial", "major"]]
  )
  assert.deepEqual(evaluation.lead.emphasize, ["Zacznij od platformy."])

  assert.deepEqual(
    [dimensions.level.offer, dimensions.level.offerSource, dimensions.level.person],
    ["senior", "stated", "senior"]
  )
  assert.equal(dimensions.level.score, 100)

  assert.equal(dimensions.pay.reason, "target")
  assert.equal(dimensions.pay.offer?.period, "month")
  assert.match(dimensions.pay.offer?.periodQuote ?? "", /22 000 - 27 000 PLN netto \/ mies\./)

  assert.equal(dimensions.workMode.score, 100)

  // published today on the company's own ATS: 60 + 15 + 10; one red flag the offer really has: −10
  assert.equal(dimensions.posting.hiring?.score, 85)
  assert.deepEqual(
    dimensions.posting.redFlags?.map((flag) => flag.quote),
    ["wear many hats"]
  )
  assert.equal(dimensions.posting.score, 75)

  // (53×45 + 100×15 + 100×15 + 100×10 + 75×15) / 100 = 75.1
  assert.equal(evaluation.score, 75)
  assert.equal(evaluation.coverage, 100)
  assert.equal(evaluation.decision, "apply")
  assert.deepEqual(evaluation.stops, [])
  assert.equal(view.usedModel, true)
  assert.deepEqual(view.cv, { id: cv.id, title: "Główne" })

  const kept = await getEvaluation(user.id, job.id)
  assert.deepEqual(kept?.evaluation, evaluation)
  assert.deepEqual(kept?.stale, { cv: false, offer: false, profile: false })
  assert.deepEqual(kept?.cv, { id: cv.id, title: "Główne" })
  const summary = await evaluationSummary(user.id, job.id)
  assert.deepEqual([summary?.decision, summary?.score, summary?.stale], ["apply", 75, false])
  assert.equal(await getEvaluation(user.id + 1_000_000, job.id), null, "only its owner reads it")
})

test("the kept evaluation says what changed since: the CV, the offer, the profile", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  const cv = await createCv({ userId: user.id, from: "content", content: syntheticCv(1) })
  await evaluateOffer(user.id, job.id, { locale: "en", llm: null })
  assert.deepEqual((await getEvaluation(user.id, job.id))?.stale, {
    cv: false,
    offer: false,
    profile: false,
  })

  const content = syntheticCv(1)
  content.header.headline = "Platform Engineer"
  await updateCv(user.id, cv.id, { content })
  assert.deepEqual((await getEvaluation(user.id, job.id))?.stale, {
    cv: true,
    offer: false,
    profile: false,
  })

  await updateOffer(user.id, job.id, { text: `${OFFER_TEXT}\nWymagamy też Go.` })
  await db.candidateProfile.update({ where: { userId: user.id }, data: { salaryFloor: 30000 } })
  assert.deepEqual((await getEvaluation(user.id, job.id))?.stale, {
    cv: true,
    offer: true,
    profile: true,
  })
  assert.equal((await evaluationSummary(user.id, job.id))?.stale, true)

  // evaluating again replaces the one kept, so nothing is out of date
  const again = await evaluateOffer(user.id, job.id, { locale: "en", llm: null })
  // the top of the range, 27 000, is now under the minimum of 30 000
  assert.equal(again.evaluation.dimensions.pay.reason, "below")
  assert.deepEqual(again.evaluation.stops, [{ code: "pay-below-minimum", effect: "consider" }])
  assert.equal(await db.offerEvaluation.count({ where: { userId: user.id, jobId: job.id } }), 1)
  assert.deepEqual((await getEvaluation(user.id, job.id))?.stale, {
    cv: false,
    offer: false,
    profile: false,
  })
})

test("without a model: what rules can compute is there, and the rest is unknown", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  await createCv({ userId: user.id, from: "content", content: syntheticCv(1) })
  const steps: StepUpdate[] = []

  const view = await evaluateOffer(user.id, job.id, {
    locale: "pl",
    llm: null,
    onStep: (update) => steps.push(update),
  })
  const { evaluation } = view
  assert.equal(view.usedModel, false)
  assert.deepEqual(
    steps.map((update) => `${update.step}:${update.state}`),
    ["offer:skipped", "match:skipped"]
  )
  assert.equal(evaluation.dimensions.requirements.score, null)
  assert.equal(evaluation.dimensions.requirements.reason, "no-model")
  assert.equal(evaluation.dimensions.level.offerSource, "title")
  assert.equal(evaluation.dimensions.level.score, 100)
  assert.equal(evaluation.dimensions.pay.score, 100)
  assert.equal(evaluation.dimensions.workMode.score, 100)
  assert.equal(evaluation.dimensions.posting.score, 85)
  assert.equal(evaluation.dimensions.posting.redFlags, null)
  assert.equal(evaluation.score, null)
  assert.equal(evaluation.coverage, 55)
  assert.equal(evaluation.decision, "unknown")
  assert.equal(evaluation.report, null)
})

test("missing data is unknown, with its reason, never a middle value", async () => {
  // no profile, no CV, no pay or work mode in the offer's data
  const user = await makeUser(null)
  const job = await makeJob({
    title: "Platform Engineer",
    normalizedTitle: "platform engineer",
    workplaceType: "UNKNOWN",
    salaryMin: null,
    salaryMax: null,
    salaryCurrency: null,
  })
  await keepOffer(user.id, job.id, { text: "Wymagamy Kubernetes.", origin: "pasted" })
  const llm = fakeLlm({ "offer-analysis": analysisReply, "cv-match": matchReply })

  const { evaluation } = await evaluateOffer(user.id, job.id, { locale: "pl", llm })
  assert.deepEqual(llm.purposes, [], "without a CV the model is not asked")
  const { dimensions } = evaluation
  assert.deepEqual(
    [
      [dimensions.requirements.score, dimensions.requirements.reason],
      [dimensions.level.score, dimensions.level.reason],
      [dimensions.pay.score, dimensions.pay.reason],
      [dimensions.workMode.score, dimensions.workMode.reason],
    ],
    [
      [null, "no-cv"],
      [null, "offer-unknown"],
      [null, "offer-undisclosed"],
      [null, "offer-unknown"],
    ]
  )
  assert.equal(evaluation.score, null)
  assert.equal(evaluation.decision, "unknown")
})

test("a model that returns nothing leaves the requirements unknown, and a closed posting is skip", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob({ status: "CLOSED" })
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  await createCv({ userId: user.id, from: "content", content: syntheticCv(1) })

  const silent = await evaluateOffer(user.id, job.id, { locale: "pl", llm: fakeLlm({}) })
  assert.equal(silent.evaluation.dimensions.requirements.reason, "offer-failed")
  assert.equal(silent.usedModel, true)
  assert.equal(silent.evaluation.dimensions.posting.reason, "closed")
  assert.deepEqual(silent.evaluation.stops, [{ code: "closed", effect: "skip" }])
  assert.equal(silent.evaluation.score, null)
  assert.equal(silent.evaluation.decision, "skip")

  const half = await evaluateOffer(user.id, job.id, {
    locale: "pl",
    llm: fakeLlm({ "offer-analysis": analysisReply }),
  })
  assert.equal(half.evaluation.dimensions.requirements.reason, "match-failed")
  assert.equal(half.evaluation.analysis?.requirements.length, 3)
})

test("a critical gap on a required item forces skip without changing the score", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2) })
  const reply = {
    ...matchReply,
    requirements: [
      matchReply.requirements[0],
      { id: "r2", status: "missing", gap: "critical", note: "Nie da się tego obejść." },
      { id: "r3", status: "met", evidence: "Node.js, PostgreSQL, Kubernetes, API" },
    ],
  }
  const { evaluation } = await evaluateOffer(user.id, job.id, {
    locale: "pl",
    llm: fakeLlm({ "offer-analysis": analysisReply, "cv-match": reply }),
  })
  // required 50 %, preferred 100 %: 50 × 0.7 + 100 × 0.3 = 65
  assert.equal(evaluation.dimensions.requirements.score, 65)
  // (65×45 + 100×15 + 100×15 + 100×10 + 75×15) / 100 = 80.5
  assert.equal(evaluation.score, 81)
  assert.deepEqual(evaluation.stops, [{ code: "critical-gap", effect: "skip" }])
  assert.equal(evaluation.decision, "skip")
  assert.deepEqual(
    evaluation.gaps.map((gap) => [gap.text, gap.level, gap.note]),
    [["PostgreSQL", "critical", "Nie da się tego obejść."]]
  )
})

test("the evaluation is in the person's export and goes with their profile and their account", async () => {
  const user = await makeUser(PROFILE)
  const job = await makeJob()
  await keepOffer(user.id, job.id, { text: OFFER_TEXT, origin: "pasted" })
  await evaluateOffer(user.id, job.id, { locale: "pl", llm: null })

  const exported = await exportAccount(user.id)
  assert.equal(exported?.offerEvaluations.length, 1)
  assert.equal(exported?.offerEvaluations[0]?.jobId, job.id)
  assert.equal(exported?.offerEvaluations[0]?.title, "Senior Platform Engineer")
  assert.ok(!("userId" in (exported?.offerEvaluations[0] ?? {})))

  await eraseProfile(user.id)
  assert.equal(await db.offerEvaluation.count({ where: { userId: user.id } }), 0)

  await evaluateOffer(user.id, job.id, { locale: "pl", llm: null })
  await db.user.delete({ where: { id: user.id } })
  assert.equal(await db.offerEvaluation.count({ where: { jobId: job.id } }), 0)
})
