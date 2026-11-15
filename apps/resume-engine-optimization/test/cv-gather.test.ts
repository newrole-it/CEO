import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import { draftGather, gatherPreview, MAX_GATHER_CHARS, saveGathered } from "../src/server/cv/gather"
import { CvError, createCv, getCv, updateCv } from "../src/server/cv/service"
import {
  appendVersion,
  contentHash,
  keepCurrentState,
  restoreVersion,
} from "../src/server/cv/versions"
import type { LlmClient } from "@newrole/llm/common"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import type { CvContent, CvExperienceSection } from "@newrole/cv-core/schema"

/**
 * "Zbierz wszystko do CV ogólnego" (src/server/cv/gather.ts): what the person added by hand in
 * their other CVs is found against what the model generated, merged by the model into a draft
 * that stores nothing, and saved as a version of its own with the state before kept.
 */

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `gather-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

async function makeUser() {
  counter += 1
  return db.user.create({ data: { email: `u${counter}-${stamp}@example.com`, role: "USER" } })
}

const clone = (cv: CvContent): CvContent => JSON.parse(JSON.stringify(cv))
const roles = (cv: CvContent) =>
  cv.sections.find((section): section is CvExperienceSection => section.type === "experience")!

const NEW_BULLET = "Wdrożyłem kolejkę zdarzeń opartą na Kafce dla zespołu płatności."
const MODEL_BULLET = "Zdanie napisane przez model pod ofertę sklepu."

/** A CV for an offer as tailoring leaves it: its content is the newest `generated` version. */
async function makeTailored(userId: number, baseCvId: string, company = "Sklep Przykładowy") {
  const content = syntheticCv(2)
  roles(content).items[0].bullets.push(MODEL_BULLET)
  const row = await db.cvDocument.create({
    data: {
      userId,
      title: `CV ${company}`,
      language: "pl",
      kind: "EDITABLE",
      content,
      baseCvId,
      targetCompany: company,
      targetTitle: "Staff Engineer",
    },
    select: { id: true },
  })
  await db.$transaction((tx) =>
    appendVersion(tx, { documentId: row.id, content, language: "pl", origin: "generated" })
  )
  return { id: row.id, content }
}

async function handEdit(userId: number, id: string, content: CvContent, bullet = NEW_BULLET) {
  const next = clone(content)
  roles(next).items[0].bullets.push(bullet)
  await updateCv(userId, id, { content: next })
  return next
}

/** A model that adds NEW_BULLET to the first role of the general CV. */
function fakeLlm(): LlmClient & { calls: number } {
  const first = roles(syntheticCv(2)).items[0]
  const llm = {
    model: "fake",
    calls: 0,
    async completeJson(args: Parameters<LlmClient["completeJson"]>[0]) {
      llm.calls += 1
      const data = args.schema.parse({
        sections: [
          { id: "experience", items: [{ id: "job1", bullets: [...first.bullets, NEW_BULLET] }] },
        ],
        notes: [{ source: "CV Sklep Przykładowy", outcome: "added", text: "Dodany punkt." }],
      })
      return { data, tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  return llm as LlmClient & { calls: number }
}

async function code(run: () => Promise<unknown>): Promise<string> {
  try {
    await run()
  } catch (error) {
    if (error instanceof CvError) return error.code
    throw error
  }
  return "no error"
}

async function setup() {
  const user = await makeUser()
  const general = await createCv({ userId: user.id, from: "content", content: syntheticCv(2) })
  return { userId: user.id, general }
}

test("a hand edit after the generated version is a source; the model's own text is not", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  const preview = await gatherPreview(userId)
  assert.equal(preview.target?.id, general.id)
  assert.deepEqual(
    preview.targets.map((target) => target.id),
    [general.id]
  )
  assert.equal(preview.sources.length, 1)
  assert.deepEqual(
    { ...preview.sources[0] },
    {
      id: tailored.id,
      title: "CV Sklep Przykładowy",
      company: "Sklep Przykładowy",
      role: "Staff Engineer",
      language: "pl",
      changes: 1,
    }
  )
  assert.deepEqual(preview.skipped, [])
})

test("a tailored CV with no hand edits is not a source, and the draft has nothing to do", async () => {
  const { userId, general } = await setup()
  await makeTailored(userId, general.id)
  const preview = await gatherPreview(userId)
  assert.deepEqual(preview.sources, [])
  const llm = fakeLlm()
  assert.equal(
    await code(() => draftGather({ userId, targetId: general.id, locale: "pl", llm })),
    "no-changes"
  )
  assert.equal(llm.calls, 0)
})

test("another general CV is compared with the target itself", async () => {
  const { userId, general } = await setup()
  const other = clone(syntheticCv(2))
  roles(other).items[1].bullets.push(NEW_BULLET)
  const second = await createCv({ userId, from: "content", content: other, title: "Drugie CV" })
  const preview = await gatherPreview(userId, general.id)
  assert.deepEqual(
    preview.sources.map((source) => [source.id, source.company, source.changes]),
    [[second.id, null, 1]]
  )
  assert.equal(preview.targets.length, 2)
})

test("an uploaded PDF without content is skipped as no-content", async () => {
  const { userId } = await setup()
  const pdf = await db.cvDocument.create({
    data: { userId, title: "Stare CV", language: "pl", kind: "UPLOADED", pdfName: "cv.pdf" },
    select: { id: true },
  })
  const preview = await gatherPreview(userId)
  assert.deepEqual(preview.skipped, [{ id: pdf.id, title: "Stare CV", reason: "no-content" }])
})

test("changes past MAX_GATHER_CHARS go to the model in a second call, none are skipped", async () => {
  const { userId, general } = await setup()
  const older = await makeTailored(userId, general.id, "Starsza Firma")
  await handEdit(userId, older.id, older.content)
  const big = clone(syntheticCv(2))
  const count = Math.ceil(MAX_GATHER_CHARS / 10_000) + 1
  for (let index = 0; index < count; index += 1) {
    big.sections.push({
      id: `big${index}`,
      type: "text",
      title: `Dodatek ${"x".repeat(index + 1)}`,
      body: "a".repeat(10_000),
    })
  }
  const newer = await createCv({ userId, from: "content", content: big, title: "Wielkie CV" })
  const preview = await gatherPreview(userId, general.id)
  assert.deepEqual(preview.sources.map((source) => source.id).sort(), [newer.id, older.id].sort())
  assert.deepEqual(preview.skipped, [])
  const llm = fakeLlm()
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm })
  assert.equal(llm.calls, 2)
  assert.ok(roles(draft.content).items[0].bullets.includes(NEW_BULLET))
  assert.equal(draft.notes.length, 2)
})

test("a hand edit is still a source after the model worked on the CV again", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const edited = await handEdit(userId, tailored.id, tailored.content)
  // "Popraw z AI" keeps the state before and stores its result as a generated version
  const improved = clone(edited)
  improved.sections[0] = { ...improved.sections[0], title: "Profil zawodowy" }
  await db.$transaction(async (tx) => {
    await keepCurrentState(tx, { id: tailored.id, content: edited, language: "pl" })
    await tx.cvDocument.update({ where: { id: tailored.id }, data: { content: improved } })
    await appendVersion(tx, {
      documentId: tailored.id,
      content: improved,
      language: "pl",
      origin: "generated",
    })
  })
  const preview = await gatherPreview(userId)
  assert.deepEqual(
    preview.sources.map((source) => [source.id, source.changes]),
    [[tailored.id, 1]]
  )
})

test("a hand edit the person took out again is not a source", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const edited = await handEdit(userId, tailored.id, tailored.content)
  await db.$transaction((tx) =>
    appendVersion(tx, {
      documentId: tailored.id,
      content: edited,
      language: "pl",
      origin: "manual",
    })
  )
  await updateCv(userId, tailored.id, { content: tailored.content })
  const preview = await gatherPreview(userId)
  assert.deepEqual(preview.sources, [])
})

test("what was gathered is not offered again; a later edit is", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const edited = await handEdit(userId, tailored.id, tailored.content)
  const other = clone(syntheticCv(2))
  roles(other).items[1].bullets.push("Punkt z drugiego CV ogólnego.")
  const second = await createCv({ userId, from: "content", content: other, title: "Drugie CV" })
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm: fakeLlm() })
  assert.deepEqual(draft.sources.map((source) => source.id).sort(), [second.id, tailored.id].sort())
  await saveGathered({
    userId,
    targetId: general.id,
    updatedAt: draft.updatedAt,
    sources: draft.sources,
    content: draft.content,
  })
  assert.deepEqual((await gatherPreview(userId, general.id)).sources, [])
  // the second general CV has not gathered them: for it they are still there
  assert.equal((await gatherPreview(userId, second.id)).sources.length, 2)

  // a later edit, with the automatic version an edit takes of the state before it
  await db.cvDocument.update({ where: { id: tailored.id }, data: { versionCheckedAt: null } })
  await handEdit(userId, tailored.id, edited, "Punkt dopisany po zebraniu.")
  const again = clone(other)
  roles(again).items[0].bullets.push("Nowy punkt w drugim CV.")
  await updateCv(userId, second.id, { content: again })
  const preview = await gatherPreview(userId, general.id)
  assert.deepEqual(
    preview.sources.map((source) => [source.id, source.changes]).sort(),
    [
      [second.id, 1],
      [tailored.id, 1],
    ].sort()
  )
})

test("a source edited between the draft and the save is offered again whole", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const edited = await handEdit(userId, tailored.id, tailored.content)
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm: fakeLlm() })
  await handEdit(userId, tailored.id, edited, "Punkt dopisany w trakcie czytania szkicu.")
  await saveGathered({
    userId,
    targetId: general.id,
    updatedAt: draft.updatedAt,
    sources: draft.sources,
    content: draft.content,
  })
  const preview = await gatherPreview(userId, general.id)
  assert.deepEqual(
    preview.sources.map((source) => [source.id, source.changes]),
    [[tailored.id, 1]]
  )
  const [source] = (await draftGather({
    userId,
    targetId: general.id,
    locale: "pl",
    llm: fakeLlm(),
  }).then((next) => next.sources)) as { id: string }[]
  assert.equal(source.id, tailored.id)
})

test("a draft that changed nothing still marks its sources as gathered", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm: fakeLlm() })
  const saved = await saveGathered({
    userId,
    targetId: general.id,
    updatedAt: draft.updatedAt,
    sources: draft.sources,
    content: general.content,
  })
  assert.equal(saved.number, null)
  assert.deepEqual((await gatherPreview(userId, general.id)).sources, [])
  const stored = await getCv(userId, general.id)
  assert.deepEqual(stored!.content, general.content)
})

test("the draft holds the edit and stores nothing", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  const before = await db.cvDocument.findUniqueOrThrow({
    where: { id: general.id },
    select: { updatedAt: true },
  })
  const versions = await db.cvVersion.count({ where: { documentId: general.id } })
  const llm = fakeLlm()
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm })
  assert.equal(llm.calls, 1)
  assert.equal(draft.targetId, general.id)
  assert.equal(draft.updatedAt, before.updatedAt.toISOString())
  assert.ok(roles(draft.content).items[0].bullets.includes(NEW_BULLET))
  assert.ok(!JSON.stringify(draft.content).includes(MODEL_BULLET))
  assert.deepEqual(draft.before, general.content)
  assert.equal(draft.notes.length, 1)
  assert.deepEqual(draft.warnings, [])
  const after = await db.cvDocument.findUniqueOrThrow({
    where: { id: general.id },
    select: { updatedAt: true, content: true },
  })
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime())
  assert.equal(await db.cvVersion.count({ where: { documentId: general.id } }), versions)
})

test("a line of the draft that names a source's company is a warning", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const line = "Znam stos technologiczny firmy Sklep Przykładowy."
  await handEdit(userId, tailored.id, tailored.content, line)
  const first = roles(syntheticCv(2)).items[0]
  const llm: LlmClient = {
    model: "fake",
    async completeJson(args) {
      const data = args.schema.parse({
        sections: [
          { id: "experience", items: [{ id: "job1", bullets: [...first.bullets, line] }] },
        ],
      })
      return { data, tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm })
  assert.deepEqual(draft.warnings, [line])
})

test("saving writes the content and a merged version, and keeps the state before", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm: fakeLlm() })
  const saved = await saveGathered({
    userId,
    targetId: general.id,
    updatedAt: draft.updatedAt,
    sources: draft.sources,
    content: draft.content,
  })
  assert.equal(saved.cvId, general.id)
  const stored = await getCv(userId, general.id)
  assert.ok(roles(stored!.content!).items[0].bullets.includes(NEW_BULLET))
  const versions = await db.cvVersion.findMany({
    where: { documentId: general.id },
    orderBy: { number: "desc" },
    select: { id: true, number: true, origin: true, contentHash: true },
  })
  assert.equal(versions[0].origin, "merged")
  assert.equal(versions[0].number, saved.number)
  const old = versions.find((version) => version.contentHash === contentHash(general.content!))
  assert.ok(old, "the state before is in the history")
  await restoreVersion(userId, general.id, old.id)
  const restored = await getCv(userId, general.id)
  assert.deepEqual(restored!.content, general.content)

  // the same content again changes nothing
  const again = await db.cvDocument.findUniqueOrThrow({
    where: { id: general.id },
    select: { updatedAt: true },
  })
  const same = await saveGathered({
    userId,
    targetId: general.id,
    updatedAt: again.updatedAt.toISOString(),
    sources: [],
    content: general.content,
  })
  assert.equal(same.number, null)
})

test("saving from a stale draft is refused and writes nothing", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  const draft = await draftGather({ userId, targetId: general.id, locale: "pl", llm: fakeLlm() })
  const edited = clone(general.content!)
  edited.header.headline = "Zmienione w innej karcie"
  await updateCv(userId, general.id, { content: edited })
  assert.equal(
    await code(() =>
      saveGathered({
        userId,
        targetId: general.id,
        updatedAt: draft.updatedAt,
        sources: draft.sources,
        content: draft.content,
      })
    ),
    "conflict"
  )
  const stored = await getCv(userId, general.id)
  assert.equal(stored!.content!.header.headline, "Zmienione w innej karcie")
  assert.equal(await db.cvVersion.count({ where: { documentId: general.id, origin: "merged" } }), 0)
})

test("saving refuses content that lacks one of the CV's roles, or is not a CV", async () => {
  const { userId, general } = await setup()
  const row = await db.cvDocument.findUniqueOrThrow({
    where: { id: general.id },
    select: { updatedAt: true },
  })
  const shorter = clone(general.content!)
  roles(shorter).items.pop()
  const save = (content: unknown) =>
    saveGathered({
      userId,
      targetId: general.id,
      updatedAt: row.updatedAt.toISOString(),
      sources: [],
      content,
    })
  assert.equal(await code(() => save(shorter)), "invalid-content")
  assert.equal(await code(() => save({ nope: true })), "invalid-content")
})

test("another person's CV is not found", async () => {
  const { general } = await setup()
  const stranger = await makeUser()
  assert.equal(
    await code(() =>
      draftGather({ userId: stranger.id, targetId: general.id, locale: "pl", llm: fakeLlm() })
    ),
    "not-found"
  )
  assert.equal(
    await code(() =>
      saveGathered({
        userId: stranger.id,
        targetId: general.id,
        updatedAt: new Date().toISOString(),
        sources: [],
        content: general.content,
      })
    ),
    "not-found"
  )
})

test("a CV for an offer cannot be saved into", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  const row = await db.cvDocument.findUniqueOrThrow({
    where: { id: tailored.id },
    select: { updatedAt: true },
  })
  assert.equal(
    await code(() =>
      saveGathered({
        userId,
        targetId: tailored.id,
        updatedAt: row.updatedAt.toISOString(),
        sources: [],
        content: general.content,
      })
    ),
    "not-found"
  )
})

test("without a model the draft says so", async () => {
  const { userId, general } = await setup()
  const tailored = await makeTailored(userId, general.id)
  await handEdit(userId, tailored.id, tailored.content)
  assert.equal(
    await code(() => draftGather({ userId, targetId: general.id, locale: "pl", llm: null })),
    "llm-unavailable"
  )
})
