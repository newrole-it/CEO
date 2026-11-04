import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { createApplication } from "../src/server/applications/service"
import {
  createCv,
  CvError,
  defaultCv,
  deleteCv,
  getCv,
  listCvs,
  tailoredCv,
  updateCv,
} from "../src/server/cv/service"
import {
  documentsForJob,
  generateLetterForJob,
  tailorContext,
  tailorCvForJob,
} from "../src/server/cv/tailor"
import {
  AUTO_VERSION_MS,
  getVersion,
  listVersions,
  MAX_AUTO_VERSIONS,
  restoreVersion,
  saveVersion,
} from "../src/server/cv/versions"
import type { LlmClient } from "../src/server/llm/common"
import { eraseAccount } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"
import type { HttpClient } from "../src/server/security/safe-fetch"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { letterSection, type CvContent } from "@newrole/cv-core/schema"
import { readOnlyExcerpt } from "@newrole/cv-core/tailor"

const db = new PrismaClient()
const stamp = `tailor-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

async function makeUser() {
  counter += 1
  return db.user.create({ data: { email: `u${counter}-${stamp}@example.com`, role: "USER" } })
}

async function makeJob(
  fields: {
    description?: string
    llmOptOut?: boolean
    source?: { sourceType: "GREENHOUSE"; sourceBoardId: string; externalId: string }
  } = {}
) {
  counter += 1
  const key = `${stamp}-${counter}`
  const company = await db.company.create({
    data: { name: `Acme ${key}`, normalizedName: `acme-${key}` },
  })
  return db.job.create({
    data: {
      companyId: company.id,
      sourceType: "LEVER",
      ...fields.source,
      title: "Staff Engineer",
      normalizedTitle: "staff engineer",
      summary: "",
      descriptionText:
        fields.description ?? "Szukamy osoby, która zna się na platformach. Wymagamy Go.",
      llmOptOut: fields.llmOptOut ?? false,
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: `job-${key}`,
      fingerprint: `fp-${key}`,
    },
  })
}

type Call = { purpose: string; user: string; system: string }

/** A model that answers with these replies in turn and remembers what it was asked. */
function fakeLlm(...replies: unknown[]): LlmClient & { calls: Call[] } {
  const calls: Call[] = []
  return {
    model: "fake",
    calls,
    async completeJson(args) {
      calls.push({ purpose: args.purpose, user: args.user, system: args.system })
      const data = replies[Math.min(calls.length - 1, replies.length - 1)]
      if (data == null) return null
      return { data: args.schema.parse(data), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const tailorReply = (body = "Buduję platformy dla dużych zespołów.") => ({
  headline: "Platform Engineering Lead",
  sections: [{ id: "profile", body }],
  changes: ["Ustawiłem profil pod platformy."],
  gaps: ["Go"],
})
const letterReply = { paragraphs: ["Piszę w sprawie roli.", "Prowadziłem zespół programistów."] }

async function general(userId: number): Promise<{ id: string; content: CvContent }> {
  const cv = await createCv({ userId, from: "content", content: syntheticCv(2), title: "Główne" })
  return { id: cv.id, content: cv.content as CvContent }
}

test("tailoring creates a document for the offer with the base and the result in its history", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const base = await general(user.id)

  const result = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: fakeLlm(tailorReply()),
  })

  assert.equal(result.content.header.headline, "Platform Engineering Lead")
  assert.equal(result.content.header.email, base.content.header.email)
  assert.deepEqual(result.notes.gaps, ["Go"])
  assert.equal(result.notes.usedJobText, true)

  const stored = await getCv(user.id, result.id)
  assert.equal(stored?.docType, "CV")
  assert.equal(stored?.isDefault, false)
  assert.equal(stored?.target?.jobId, job.id)
  assert.match(stored?.title ?? "", /Staff Engineer/)

  const versions = await listVersions(user.id, result.id)
  assert.deepEqual(
    versions.map((version) => [version.number, version.origin, version.isCurrent]),
    [
      [2, "generated", true],
      [1, "base", false],
    ]
  )
  const first = await getVersion(user.id, result.id, versions[1].id)
  assert.equal(first?.content.header.headline, base.content.header.headline)

  // the general CV is untouched and stays the default
  const original = await getCv(user.id, base.id)
  assert.deepEqual(original?.content, base.content)
  assert.equal((await defaultCv(user.id))?.id, base.id)
  assert.equal((await tailoredCv(user.id, job.id))?.id, result.id)
})

test("tailoring again keeps the person's edits in history and works from the original CV", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const base = await general(user.id)
  const first = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: fakeLlm(tailorReply()),
  })

  const edited = {
    ...first.content,
    header: { ...first.content.header, headline: "Mój własny nagłówek" },
  }
  await updateCv(user.id, first.id, { content: edited })

  const llm = fakeLlm(tailorReply("Drugie podejście."))
  const second = await tailorCvForJob({ userId: user.id, jobId: job.id, llm })

  assert.equal(second.id, first.id, "one tailored CV per offer")
  // it read the general CV, not the previous result with its edits
  assert.ok(
    llm.calls[0].user.includes(`"headline":${JSON.stringify(base.content.header.headline)}`)
  )
  assert.ok(!llm.calls[0].user.includes("Mój własny nagłówek"))
  assert.match(llm.calls[0].user, /Attempt 2/, "a new attempt must not hit the reply cache")

  const versions = await listVersions(user.id, first.id)
  assert.deepEqual(
    versions.map((version) => version.origin),
    ["generated", "auto", "generated", "base"]
  )
  const kept = await getVersion(user.id, first.id, versions[1].id)
  assert.equal(kept?.content.header.headline, "Mój własny nagłówek")
})

test("a failed model stores nothing, and a missing model says so", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await general(user.id)

  await assert.rejects(
    tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(null) }),
    (error: unknown) => error instanceof CvError && error.code === "llm-failed"
  )
  await assert.rejects(
    tailorCvForJob({ userId: user.id, jobId: job.id, llm: null }),
    (error: unknown) => error instanceof CvError && error.code === "llm-unavailable"
  )
  await assert.rejects(
    generateLetterForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(null) }),
    (error: unknown) => error instanceof CvError && error.code === "llm-failed"
  )
  assert.deepEqual(await documentsForJob(user.id, job.id), { cvId: null, letterId: null })
})

test("no CV and no profile is its own error; an unknown offer too", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await assert.rejects(
    tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) }),
    (error: unknown) => error instanceof CvError && error.code === "no-base"
  )
  await assert.rejects(
    tailorCvForJob({ userId: user.id, jobId: "nope", llm: fakeLlm(tailorReply()) }),
    (error: unknown) => error instanceof CvError && error.code === "job-not-found"
  )
})

test("an uploaded PDF as the base uses its editable copy instead of reading the file again", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const upload = await db.cvDocument.create({
    data: {
      userId: user.id,
      title: "Moje CV",
      kind: "UPLOADED",
      isDefault: true,
      pdf: Buffer.from("%PDF-1.4 not really"),
      pdfName: "cv.pdf",
      pdfUpdatedAt: new Date(),
    },
  })
  const content = syntheticCv(1)
  content.header.headline = "Nagłówek z kopii edytowalnej"
  const copy = await createCv({ userId: user.id, from: "content", content, baseCvId: upload.id })

  const llm = fakeLlm(tailorReply())
  await tailorCvForJob({ userId: user.id, jobId: job.id, llm })
  assert.match(llm.calls[0].user, /Nagłówek z kopii edytowalnej/)
  assert.equal(
    (await listCvs(user.id)).filter((row) => !row.target).length,
    2,
    "no second editable copy"
  )
  const tailored = await db.cvDocument.findFirst({
    where: { userId: user.id, jobId: job.id },
    select: { baseCvId: true },
  })
  assert.equal(tailored?.baseCvId, copy.id)
})

test("an offer that opted out of AI never reaches the model; the person's own note does", async () => {
  const user = await makeUser()
  const secret = `Tajny opis oferty ${stamp}`
  const job = await makeJob({ description: secret, llmOptOut: true })
  await general(user.id)

  const llm = fakeLlm(tailorReply())
  const plain = await tailorCvForJob({ userId: user.id, jobId: job.id, llm })
  assert.ok(!llm.calls[0].user.includes(secret))
  assert.match(llm.calls[0].user, /Staff Engineer/)
  assert.equal(plain.notes.usedJobText, false)

  const letters = fakeLlm(letterReply)
  await generateLetterForJob({ userId: user.id, jobId: job.id, llm: letters })
  assert.ok(!letters.calls[0].user.includes(secret))

  const withNote = fakeLlm(tailorReply())
  const noted = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    note: "Wymagania: Kubernetes",
    llm: withNote,
  })
  assert.match(withNote.calls[0].user, /Wymagania: Kubernetes/)
  assert.equal(noted.notes.usedJobText, true)
})

const greenhouseSource = {
  sourceType: "GREENHOUSE",
  sourceBoardId: "acme",
  externalId: "7",
} as const

function greenhouseHttp(content: string): HttpClient {
  return {
    get: async (url) => ({
      url,
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: 7,
        title: "Staff Engineer",
        absolute_url: "https://boards.greenhouse.io/acme/jobs/7",
        company_name: "Acme",
        content,
      }),
    }),
    post: async () => {
      throw new Error("Reading an offer never posts")
    },
  }
}

test("the model reads the whole offer from its source, and the index keeps only its excerpt", async () => {
  const user = await makeUser()
  const excerpt = `Fragment z indeksu ${stamp}`
  const job = await makeJob({ description: excerpt, source: greenhouseSource })
  await general(user.id)
  const whole = `${"Budujemy platformę płatności. ".repeat(30)}Wymagamy Kubernetes ${stamp}.`

  const http = greenhouseHttp(whole)
  const llm = fakeLlm(tailorReply())
  const result = await tailorCvForJob({ userId: user.id, jobId: job.id, llm, http })

  assert.ok(llm.calls[0].user.includes(`Wymagamy Kubernetes ${stamp}`))
  assert.equal(result.notes.offerText?.origin, "full")
  assert.ok((result.notes.offerText?.chars ?? 0) > 300)

  // the letter is written from the same reading
  const letters = fakeLlm(letterReply)
  const letter = await generateLetterForJob({ userId: user.id, jobId: job.id, llm: letters, http })
  assert.ok(letters.calls[0].user.includes(`Wymagamy Kubernetes ${stamp}`))
  assert.equal(letter.notes.offerText?.origin, "full")

  const row = await db.job.findUniqueOrThrow({ where: { id: job.id } })
  assert.equal(row.descriptionText, excerpt)
  const saved = await db.cvDocument.findUniqueOrThrow({ where: { id: result.id } })
  assert.ok(!JSON.stringify(saved.tailorNotes).includes(`Wymagamy Kubernetes ${stamp}`))
})

test("when the source cannot be read, the model gets the excerpt and the notes say so", async () => {
  const user = await makeUser()
  const excerpt = `Fragment z indeksu ${stamp}`
  const job = await makeJob({ description: excerpt, source: greenhouseSource })
  await general(user.id)
  const http: HttpClient = {
    get: async () => {
      throw new Error("socket hang up")
    },
    post: async () => {
      throw new Error("Reading an offer never posts")
    },
  }

  const llm = fakeLlm(tailorReply())
  const plain = await tailorCvForJob({ userId: user.id, jobId: job.id, llm, http })
  assert.ok(llm.calls[0].user.includes(excerpt))
  assert.equal(plain.notes.offerText?.origin, "excerpt")
  assert.equal(readOnlyExcerpt(plain.notes), true)

  const noted = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    note: "Wymagania: Kubernetes",
    llm: fakeLlm(tailorReply()),
    http,
  })
  assert.equal(readOnlyExcerpt(noted.notes), false)
})

test("the letter builds on the tailored CV and stays out of everything that means a CV", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const base = await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })

  const llm = fakeLlm(letterReply)
  const letter = await generateLetterForJob({ userId: user.id, jobId: job.id, llm })

  assert.match(llm.calls[0].user, /Platform Engineering Lead/, "written from the tailored CV")
  const section = letterSection(letter.content)
  assert.ok(section)
  assert.equal(section.paragraphs.length, 2)
  assert.equal(letter.content.header.photo, null)
  assert.equal(letter.content.consent, null)

  const stored = await getCv(user.id, letter.id)
  assert.equal(stored?.docType, "LETTER")
  assert.deepEqual(await documentsForJob(user.id, job.id), { cvId: cv.id, letterId: letter.id })

  // listings and defaults
  assert.deepEqual((await listCvs(user.id)).map((row) => row.id).sort(), [base.id, cv.id].sort())
  assert.equal((await listCvs(user.id, { letters: true })).length, 3)
  assert.equal((await defaultCv(user.id))?.id, base.id)

  // both sides of the switch in the editor
  const context = await tailorContext(user.id, stored!)
  assert.equal(context?.cvId, cv.id)
  assert.equal(context?.letterId, letter.id)
  assert.equal(context?.job.company.startsWith("Acme"), true)
  assert.equal(await tailorContext(user.id, (await getCv(user.id, base.id))!), null)

  // writing it again adds a version to the same document
  const again = await generateLetterForJob({
    userId: user.id,
    jobId: job.id,
    llm: fakeLlm({ paragraphs: ["Inny tekst."] }),
  })
  assert.equal(again.id, letter.id)
  const versions = await listVersions(user.id, letter.id)
  assert.deepEqual(
    versions.map((version) => version.origin),
    ["generated", "generated"]
  )
})

test("a letter flags numbers and names that nothing backs up", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await general(user.id)
  const letter = await generateLetterForJob({
    userId: user.id,
    jobId: job.id,
    llm: fakeLlm({ paragraphs: ["Zwiększyłem przychody o 73% dzięki Terraform."] }),
  })
  assert.deepEqual(letter.notes.unverified.sort(), ["73", "Terraform"].sort())
})

test("the default CV survives deleting a tailored document, and is never replaced by one", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const base = await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  await generateLetterForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(letterReply) })

  await deleteCv(user.id, cv.id)
  assert.equal((await defaultCv(user.id))?.id, base.id)
  assert.equal((await documentsForJob(user.id, job.id)).cvId, null)
  assert.ok((await documentsForJob(user.id, job.id)).letterId, "the letter stays")

  const second = await createCv({ userId: user.id, from: "content", content: syntheticCv(1) })
  await deleteCv(user.id, base.id)
  assert.equal((await defaultCv(user.id))?.id, second.id, "the next general CV takes over")
  assert.equal((await defaultCv(user.id))?.isDefault, true)
})

test("an application for the offer uses the CV written for it, whichever came first", async () => {
  const user = await makeUser()
  await general(user.id)

  const tailoredFirst = await makeJob()
  const cv = await tailorCvForJob({
    userId: user.id,
    jobId: tailoredFirst.id,
    llm: fakeLlm(tailorReply()),
  })
  const applied = await createApplication({
    userId: user.id,
    jobId: tailoredFirst.id,
    source: "nowarola",
    channel: "web",
  })
  assert.equal(applied.application.cvDocumentId, cv.id)

  const appliedFirst = await makeJob()
  const before = await createApplication({
    userId: user.id,
    jobId: appliedFirst.id,
    source: "nowarola",
    channel: "web",
  })
  assert.equal(before.application.cvDocumentId, null)
  const later = await tailorCvForJob({
    userId: user.id,
    jobId: appliedFirst.id,
    llm: fakeLlm(tailorReply()),
  })
  const row = await db.application.findUnique({ where: { id: before.application.id } })
  assert.equal(row?.cvDocumentId, later.id)
})

test("editing takes an automatic version when due, without touching what is not due", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  const edit = (headline: string) => ({ ...content, header: { ...content.header, headline } })

  assert.deepEqual(await listVersions(user.id, id), [])
  await updateCv(user.id, id, { content: edit("Pierwsza zmiana") })
  let versions = await listVersions(user.id, id)
  assert.equal(versions.length, 1, "the first edit keeps the state before it")
  assert.equal(versions[0].origin, "auto")
  assert.equal(
    (await getVersion(user.id, id, versions[0].id))?.content.header.headline,
    content.header.headline
  )

  // autosave a moment later adds nothing
  await updateCv(user.id, id, { content: edit("Druga zmiana") })
  assert.equal((await listVersions(user.id, id)).length, 1)

  // a title is not content
  await updateCv(user.id, id, { title: "Nowy tytuł" })
  assert.equal((await listVersions(user.id, id)).length, 1)

  // once due, the state before the edit is kept
  await db.cvDocument.update({
    where: { id },
    data: { versionCheckedAt: new Date(Date.now() - AUTO_VERSION_MS - 1000) },
  })
  await updateCv(user.id, id, { content: edit("Trzecia zmiana") })
  versions = await listVersions(user.id, id)
  assert.equal(versions.length, 2)
  assert.equal(
    (await getVersion(user.id, id, versions[0].id))?.content.header.headline,
    "Druga zmiana"
  )
})

test("saving the same content twice does not make a copy; a name goes on the newest version", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)

  const first = await saveVersion(user.id, id, "  Przed   skróceniem ")
  assert.equal(first?.created, true)
  assert.equal(first?.version.label, "Przed skróceniem")
  assert.equal(first?.version.origin, "manual")
  assert.equal(first?.version.isCurrent, true)

  const before = await getCv(user.id, id)
  const same = await saveVersion(user.id, id, "Lepsza nazwa")
  assert.equal(same?.created, false)
  assert.equal(same?.version.number, 1)
  assert.equal(same?.version.label, "Lepsza nazwa")
  const after = await getCv(user.id, id)
  assert.equal(
    after?.updatedAt.getTime(),
    before?.updatedAt.getTime(),
    "a name changes no document"
  )

  await updateCv(user.id, id, {
    content: { ...content, header: { ...content.header, headline: "Inaczej" } },
  })
  const next = await saveVersion(user.id, id)
  assert.equal(next?.created, true)
  assert.equal(next?.version.number, 2)
  assert.equal(next?.version.label, null)
})

test("restoring brings content back as a new version and loses nothing", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  const v1 = await saveVersion(user.id, id, "Punkt wyjścia")
  const edited = { ...content, header: { ...content.header, headline: "Późniejsza zmiana" } }
  await updateCv(user.id, id, { content: edited, language: "en" })

  const restored = await restoreVersion(user.id, id, v1!.version.id)
  assert.equal(restored?.content.header.headline, content.header.headline)
  assert.equal(restored?.language, "pl")
  assert.equal(restored?.version.origin, "restored")
  assert.equal(restored?.version.sourceNumber, 1)

  const stored = await getCv(user.id, id)
  assert.equal(stored?.content?.header.headline, content.header.headline)
  assert.equal(stored?.language, "pl")

  const versions = await listVersions(user.id, id)
  assert.deepEqual(
    versions.map((version) => [version.number, version.origin, version.isCurrent]),
    [
      [3, "restored", true],
      [2, "auto", false],
      [1, "manual", true],
    ]
  )
  const kept = await getVersion(user.id, id, versions[1].id)
  assert.equal(kept?.content.header.headline, "Późniejsza zmiana", "the edit is still in history")
})

test("automatic versions are capped; the named ones stay", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  await saveVersion(user.id, id, "Nazwana")
  for (let i = 0; i <= MAX_AUTO_VERSIONS; i += 1) {
    await db.cvDocument.update({ where: { id }, data: { versionCheckedAt: new Date(0) } })
    await updateCv(user.id, id, {
      content: { ...content, header: { ...content.header, headline: `Wersja ${i}` } },
    })
  }
  const versions = await listVersions(user.id, id)
  assert.equal(versions.filter((version) => version.origin === "auto").length, MAX_AUTO_VERSIONS)
  assert.equal(versions.filter((version) => version.label === "Nazwana").length, 1)
})

test("history belongs to its owner", async () => {
  const owner = await makeUser()
  const stranger = await makeUser()
  const { id } = await general(owner.id)
  const saved = await saveVersion(owner.id, id, "Moja")
  const versionId = saved!.version.id

  assert.deepEqual(await listVersions(stranger.id, id), [])
  assert.equal(await getVersion(stranger.id, id, versionId), null)
  assert.equal(await saveVersion(stranger.id, id, "Cudza"), null)
  assert.equal(await restoreVersion(stranger.id, id, versionId), null)
  assert.equal((await listVersions(owner.id, id)).length, 1)
})

test("a version of one document cannot be restored into another", async () => {
  const user = await makeUser()
  const first = await general(user.id)
  const second = await general(user.id)
  const saved = await saveVersion(user.id, first.id)
  assert.equal(await restoreVersion(user.id, second.id, saved!.version.id), null)
  assert.equal(await getVersion(user.id, second.id, saved!.version.id), null)
})

test("export carries versions and letters; deleting the account removes them", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  const letter = await generateLetterForJob({
    userId: user.id,
    jobId: job.id,
    llm: fakeLlm(letterReply),
  })

  const exported = await exportAccount(user.id)
  const documents = (exported?.cvDocuments ?? []) as { id: string; versions: unknown[] }[]
  assert.equal(documents.length, 3)
  assert.equal(documents.find((row) => row.id === cv.id)?.versions.length, 2)
  assert.equal(documents.find((row) => row.id === letter.id)?.versions.length, 1)

  await eraseAccount(user.id)
  assert.equal(await db.cvDocument.count({ where: { userId: user.id } }), 0)
  assert.equal(await db.cvVersion.count({ where: { documentId: { in: [cv.id, letter.id] } } }), 0)
  assert.ok(await db.job.findUnique({ where: { id: job.id } }), "the public offer stays")
})

test("removing the offer leaves the documents with the company and role they were written for", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  await db.job.delete({ where: { id: job.id } })

  const stored = await getCv(user.id, cv.id)
  assert.equal(stored?.target?.jobId, null)
  assert.equal(stored?.target?.title, "Staff Engineer")
  const context = await tailorContext(user.id, stored!)
  assert.equal(context?.job.id, null)
  assert.equal(context?.cvId, cv.id)
})
