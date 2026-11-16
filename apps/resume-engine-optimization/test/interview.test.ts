import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { createCv } from "../src/server/cv/service"
import { getInterviewPrep, prepareInterview } from "../src/server/interview/prep"
import {
  deleteStory,
  draftStories,
  getStory,
  listStories,
  saveStory,
} from "../src/server/interview/stories"
import { INTERVIEW_LIMITS, InterviewError, inInterviewStage } from "../src/server/interview/types"
import { eraseAccount } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"
import type { LlmClient } from "@newrole/llm/common"
import { checkCv } from "@newrole/cv-core/ats"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { MatchReport, OfferAnalysis } from "@newrole/cv-core/match"

/**
 * The story bank and interview preparation (src/server/interview): stories are the person's own,
 * a model's draft stays a draft until saved and only what their data backs is kept, and the
 * preparation for an offer is made with and without a model and stored per person and offer.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `interview-${Date.now()}`

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

const OFFER_TEXT =
  "Szukamy osoby na stanowisko Engineering Manager. Wymagamy doświadczenia w prowadzeniu zespołu programistów oraz znajomości PostgreSQL. Mile widziany Terraform. Pracujemy w dynamicznym środowisku."

async function makeJob(userId?: number) {
  counter += 1
  const key = `${stamp}-${counter}`
  const company = await db.company.create({
    data: { name: `Acme ${key}`, normalizedName: `acme-${key}` },
  })
  const job = await db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      title: "Engineering Manager",
      normalizedTitle: "engineering manager",
      summary: "",
      descriptionText: "",
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
    },
  })
  if (userId)
    await db.userOffer.create({
      data: { userId, jobId: job.id, text: OFFER_TEXT, textOrigin: "pasted" },
    })
  return job
}

/** A model that answers each purpose with its reply and remembers what it was asked for. */
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

const code = (error: unknown) => error instanceof InterviewError && error.code

test("a story is added, changed and deleted, and only by its owner", async () => {
  const [user, other] = await Promise.all([makeUser(), makeUser()])
  const story = await saveStory(user.id, {
    title: "  Przejęcie zespołu  ",
    situation: "Zespół został bez lidera.",
    action: "Prowadziłem planowanie.",
    themes: ["przywództwo", "Przywództwo", "zmiana"],
    source: "Przykładowa Firma 1",
  })
  assert.equal(story.title, "Przejęcie zespołu")
  assert.equal(story.status, "saved")
  assert.equal(story.origin, "manual")
  assert.deepEqual(story.themes, ["przywództwo", "zmiana"])

  const changed = await saveStory(user.id, { ...story, result: "Zespół dowiózł wydanie." })
  assert.equal(changed.id, story.id)
  assert.equal(changed.result, "Zespół dowiózł wydanie.")
  assert.deepEqual(
    (await listStories(user.id)).map((row) => row.id),
    [story.id]
  )

  assert.deepEqual(await listStories(other.id), [])
  assert.equal(await getStory(other.id, story.id), null)
  await assert.rejects(saveStory(other.id, { id: story.id, title: "Cudza" }), (error) => {
    return code(error) === "not-found"
  })
  await assert.rejects(deleteStory(other.id, story.id), (error) => code(error) === "not-found")
  await assert.rejects(saveStory(user.id, { title: "   " }), (error) => code(error) === "invalid")

  await deleteStory(user.id, story.id)
  assert.deepEqual(await listStories(user.id), [])
})

test("without a model or without data nothing is drafted, and the code says why", async () => {
  const user = await makeUser()
  assert.deepEqual(await draftStories(user.id, { locale: "pl", llm: null }), {
    code: "no-model",
    stories: [],
    dropped: 0,
  })
  const llm = fakeLlm({})
  assert.equal((await draftStories(user.id, { locale: "pl", llm })).code, "no-data")
  assert.deepEqual(llm.purposes, [], "the model is not asked when there is nothing to read")

  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  assert.equal((await draftStories(user.id, { locale: "pl", llm })).code, "failed")
  assert.deepEqual(await listStories(user.id), [])
})

test("a draft is kept only as far as the person's data backs it, and stays a draft until saved", async () => {
  const user = await makeUser()
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const llm = fakeLlm({
    "interview-stories": {
      stories: [
        {
          title: "Standardy pracy zespołów",
          source: "Przykładowa Firma 1",
          evidence: "Ustalałem standardy kodu, testów oraz dokumentacji technicznej",
          situation: "Zespoły pracowały bez wspólnych standardów.",
          task: "Miałem ustalić standardy kodu i testów.",
          action:
            "Ustaliłem standardy kodu, testów oraz dokumentacji. Wdrożyłem je w 14 zespołach na platformie gRPC.",
          result: "Wydania przyspieszyły o połowę.",
          resultEvidence: "wydania przyspieszyły o połowę",
          themes: ["standardy", "przywództwo"],
          questions: ["Ile zespołów objęły standardy?"],
        },
        {
          title: "Platforma płatności dla banku",
          evidence: "Zbudowałem platformę płatności dla dużego banku",
          action: "Zbudowałem platformę płatności.",
          themes: [],
          questions: [],
        },
      ],
    },
  })
  const result = await draftStories(user.id, { locale: "pl", llm })
  assert.equal(result.code, "drafted")
  assert.equal(result.dropped, 1, "the draft with no fragment in the data is thrown away")
  assert.equal(result.stories.length, 1)
  const [draft] = result.stories
  assert.equal(draft.status, "draft")
  assert.equal(draft.origin, "draft")
  assert.equal(draft.action, "Ustaliłem standardy kodu, testów oraz dokumentacji.")
  assert.equal(draft.result, "", "a result the data does not state is left to the person")
  assert.equal(draft.reflection, "")
  assert.deepEqual(draft.checks?.questions, ["Ile zespołów objęły standardy?"])
  assert.ok(draft.checks?.removed.some((item) => item.kind === "number" && item.value === "14"))

  assert.deepEqual(await listStories(user.id, { status: "saved" }), [])
  assert.equal((await listStories(user.id, { status: "draft" })).length, 1)

  // a second run does not draft the same story again
  const again = await draftStories(user.id, { locale: "pl", llm })
  assert.equal(again.code, "nothing")
  assert.equal((await listStories(user.id)).length, 1)

  const saved = await saveStory(user.id, { ...draft, result: "Zespoły pracują według nich." })
  assert.equal(saved.status, "saved")
  assert.equal(saved.origin, "draft", "it still says where it came from")
  assert.equal(saved.checks, null)
  assert.equal((await listStories(user.id, { status: "saved" })).length, 1)
})

test("without a model the preparation is made by rules, stored, and says what is missing", async () => {
  const user = await makeUser()
  const job = await makeJob(user.id)
  assert.equal(await getInterviewPrep(user.id, job.id), null)

  const made = await prepareInterview(user.id, job.id, { locale: "pl", llm: null })
  assert.equal(made.content.reader, "rules")
  assert.equal(made.content.risks, null, "no match: the risks are unknown, not none")
  assert.deepEqual(made.content.missing, ["requirements", "match", "stories", "cv", "model"])
  assert.ok(made.content.questions.length > 0)
  assert.ok(made.content.questions.every((question) => question.basis.kind === "general"))
  // the offer's text names no pay and no contract; "dynamicznym środowisku" is not a work mode
  assert.deepEqual(
    made.content.asks.filter((ask) => ask.basis.kind === "unknown").map((ask) => ask.id),
    ["unknown:salary", "unknown:work-mode", "unknown:contract"]
  )

  const stored = await getInterviewPrep(user.id, job.id)
  assert.deepEqual(stored?.content, made.content)
  assert.equal(stored?.locale, "pl")
  assert.equal(stored?.title, "Engineering Manager")

  await assert.rejects(
    prepareInterview(user.id, "no-such-job", { locale: "pl", llm: null }),
    (error) => code(error) === "job-not-found"
  )
})

const analysisReply = {
  role: "Kieruje zespołem inżynierów.",
  seniority: "",
  requirements: [
    { text: "prowadzenie zespołu programistów", importance: "required", kind: "experience" },
    { text: "znajomość PostgreSQL", importance: "required", kind: "tool", keyword: "PostgreSQL" },
    { text: "Terraform", importance: "preferred", kind: "tool", keyword: "Terraform" },
  ],
  keywords: [],
  responsibilities: [],
  redFlags: [{ quote: "dynamicznym środowisku", why: "Może oznaczać nadgodziny." }],
  signals: [],
}

test("with a model the offer is read, the CV checked and the wording verified", async () => {
  const user = await makeUser()
  const job = await makeJob(user.id)
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const story = await saveStory(user.id, {
    title: "Przejęcie zespołu",
    situation: "Zespół został bez lidera.",
    action: "Prowadziłem zespół programistów przez pół roku.",
  })
  await draftStoryOnly(user.id)

  const llm = fakeLlm({
    "offer-analysis": analysisReply,
    "cv-match": {
      requirements: [
        { id: "r1", status: "met", evidence: "Prowadziłem zespół programistów" },
        { id: "r2", status: "missing", gap: "major", note: "Powiedz, z czym pracowałaś." },
        { id: "r3", status: "missing", gap: "minor" },
      ],
      strengths: [],
      emphasize: [],
      talkingPoints: [],
    },
    "interview-prep": {
      questions: [
        { requirementId: "r1", audience: "manager", text: "Jak prowadzisz zespół programistów?" },
        { requirementId: "r3", text: "Jak używasz Terraform razem z Pulumi?" },
      ],
      mapping: [
        {
          requirementId: "r1",
          storyId: story.id,
          fit: "strong",
          evidence: "Prowadziłem zespół programistów przez pół roku",
        },
        { requirementId: "r2", storyId: story.id, fit: "strong", evidence: "Stroiłem PostgreSQL" },
      ],
      risks: [{ requirementId: "r2", line: "Pracowałam z PostgreSQL przez 9 lat." }],
      asks: [{ text: "Jak wygląda typowy tydzień?", quote: "dynamicznym środowisku" }],
    },
  })
  const made = await prepareInterview(user.id, job.id, { locale: "pl", llm })
  assert.deepEqual(llm.purposes, ["offer-analysis", "cv-match", "interview-prep"])
  const { content } = made
  assert.equal(content.reader, "llm")
  assert.equal(content.basis.match, "fresh")
  assert.deepEqual(content.missing, [])
  assert.deepEqual(
    content.stories,
    [{ id: story.id, title: "Przejęcie zespołu" }],
    "a draft is not one of the person's stories yet"
  )

  const asked = content.questions.find((question) => question.id === "manager:r1")
  assert.equal(asked?.text, "Jak prowadzisz zespół programistów?")
  assert.equal(asked?.storyId, story.id)
  const invented = content.questions.find(
    (question) => question.basis.kind === "requirement" && question.basis.requirementId === "r3"
  )
  assert.equal(invented?.text, null, "a question naming a tool the offer does not name is dropped")

  const [first, second] = content.mapping
  assert.deepEqual(
    { storyId: first.storyId, fit: first.fit, by: first.by },
    { storyId: story.id, fit: "strong", by: "model" }
  )
  assert.equal(second.fit, "partial", "strong without a fragment of the story counts as partial")

  assert.deepEqual(
    content.risks?.map((risk) => ({ id: risk.requirementId, line: risk.line, by: risk.by })),
    [{ id: "r2", line: "Powiedz, z czym pracowałaś.", by: "match" }],
    "a line with a number the data does not have falls back to the match's note"
  )
  assert.deepEqual(content.asks[0], {
    id: "flag:1",
    text: "Jak wygląda typowy tydzień?",
    basis: { kind: "red-flag", quote: "dynamicznym środowisku", why: "Może oznaczać nadgodziny." },
  })

  // made again: still one stored preparation per person and offer
  await prepareInterview(user.id, job.id, { locale: "en", llm: null })
  assert.equal(await db.interviewPrep.count({ where: { userId: user.id, jobId: job.id } }), 1)
  assert.equal((await getInterviewPrep(user.id, job.id))?.locale, "en")
})

/** One draft in the bank, to show that drafts are left out of a preparation. */
async function draftStoryOnly(userId: number) {
  await db.interviewStory.create({
    data: { userId, title: "Szkic o PostgreSQL", action: "Stroiłem PostgreSQL.", status: "DRAFT" },
  })
}

test("the newest round of the CV written for the offer gives the requirements and the risks", async () => {
  const user = await makeUser()
  const job = await makeJob(user.id)
  const content = syntheticCv(2)
  const analysis: OfferAnalysis = {
    role: "",
    seniority: "",
    requirements: [
      { id: "r1", text: "znajomość Terraform", importance: "required", kind: "tool" },
      { id: "r2", text: "PostgreSQL", importance: "required", kind: "tool", keyword: "PostgreSQL" },
    ],
    keywords: [],
    responsibilities: [],
    redFlags: [],
    signals: [],
  }
  const report: MatchReport = {
    score: 50,
    band: "stretch",
    groups: {
      required: { met: 1, partial: 0, total: 2, percent: 50 },
      preferred: { met: 0, partial: 0, total: 0, percent: null },
      soft: { met: 0, partial: 0, total: 0, percent: null },
    },
    requirements: [
      { ...analysis.requirements[0], status: "missing", evidence: "", gap: "major", note: "" },
      { ...analysis.requirements[1], status: "met", evidence: "PostgreSQL", gap: null, note: "" },
    ],
    strengths: [],
    emphasize: [],
    talkingPoints: [],
    critical: 0,
  }
  const check = checkCv(content)
  const ats = { keywords: [], score: null, found: 0, total: 0, overused: [], check }
  const notes = {
    changes: [],
    gaps: [],
    unverified: [],
    reverted: 0,
    usedJobText: true,
    match: {
      analysis,
      report,
      cv: { before: check, after: check },
      ats: { before: ats, after: ats },
      bullets: null,
      steps: [],
    },
  }
  const document = await db.cvDocument.create({
    data: {
      userId: user.id,
      title: "CV pod ofertę",
      jobId: job.id,
      targetCompany: "Acme",
      targetTitle: "Engineering Manager",
      content,
      tailorNotes: notes,
    },
  })
  await db.matchRound.create({
    data: { userId: user.id, documentId: document.id, number: 3, notes, score: 50 },
  })

  const made = await prepareInterview(user.id, job.id, { locale: "pl", llm: null })
  assert.deepEqual(made.content.basis, {
    match: "round",
    matchRound: 3,
    score: 50,
    requirements: 2,
  })
  assert.deepEqual(
    made.content.risks?.map((risk) => [risk.requirementId, risk.status, risk.by]),
    [["r1", "missing", "none"]]
  )
  assert.deepEqual(made.content.missing, ["stories", "model"])
  assert.deepEqual(
    made.content.mapping.map((item) => item.fit),
    ["none", "none"]
  )
  // what the match found in the CV is where a missing story can start
  assert.equal(made.content.mapping[1].lead, "PostgreSQL")
})

test("stories and preparations are in the export and go with the account", async () => {
  const user = await makeUser()
  const job = await makeJob(user.id)
  await saveStory(user.id, { title: "Historia do eksportu" })
  await prepareInterview(user.id, job.id, { locale: "pl", llm: null })

  const exported = await exportAccount(user.id)
  assert.deepEqual(
    exported?.interviewStories.map((story) => story.title),
    ["Historia do eksportu"]
  )
  assert.equal(exported?.interviewPreps.length, 1)
  assert.equal(exported?.interviewPreps[0].title, "Engineering Manager")
  assert.ok(!("userId" in (exported?.interviewStories[0] ?? {})))

  await eraseAccount(user.id)
  assert.equal(await db.interviewStory.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.interviewPrep.count({ where: { userId: user.id } }), 0)
})

test("model runs are capped per hour, and the cap never replaces a preparation", async () => {
  const user = await makeUser()
  const job = await makeJob(user.id)
  await createCv({ userId: user.id, from: "content", content: syntheticCv(2), title: "Główne" })
  const now = new Date()
  await db.authRateLimit.createMany({
    data: [
      { key: INTERVIEW_LIMITS.draft.key(user.id), windowStart: now, count: 10 },
      { key: INTERVIEW_LIMITS.prep.key(user.id), windowStart: now, count: 20 },
    ],
  })
  const llm = fakeLlm({})
  assert.equal((await draftStories(user.id, { locale: "pl", llm })).code, "limited")
  await assert.rejects(
    prepareInterview(user.id, job.id, { locale: "pl", llm }),
    (error) => code(error) === "limited"
  )
  assert.deepEqual(llm.purposes, [])
  assert.equal(await getInterviewPrep(user.id, job.id), null)
  // rules need no model, so they are not capped
  assert.equal(
    (await prepareInterview(user.id, job.id, { locale: "pl", llm: null })).content.reader,
    "rules"
  )
  await eraseAccount(user.id)
  assert.equal(await db.authRateLimit.count({ where: { key: { endsWith: `:${user.id}` } } }), 0)
})

test("the link to the preparation shows from the first screen to the final round", () => {
  assert.deepEqual(
    ["APPLIED", "SCREENING", "INTERVIEW", "TASK", "FINAL", "OFFER", "REJECTED", null].map(
      (status) => inInterviewStage(status)
    ),
    [false, true, true, true, true, false, false, false]
  )
})
