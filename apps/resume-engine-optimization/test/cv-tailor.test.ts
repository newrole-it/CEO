import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { createApplication } from "../src/server/applications/service"
import {
  createCv,
  createGeneralLetter,
  CvError,
  defaultCv,
  deleteCv,
  duplicateCv,
  generalLetterOf,
  getCv,
  listCvs,
  pairContext,
  tailoredCv,
  updateCv,
} from "../src/server/cv/service"
import {
  documentsForJob,
  generalLetterForJob,
  generateLetterForJob,
  nextMatchRound,
  saveToGeneralCv,
  tailorContext,
  tailorCvForJob,
  writeGeneralLetterForCv,
} from "../src/server/cv/tailor"
import { getRound, listRounds, matchScores, saveMatchComment } from "../src/server/cv/match-rounds"
import { listOffers } from "../src/server/offers/service"
import {
  AUTO_VERSION_MS,
  getVersion,
  keepPdfVersion,
  listVersions,
  MAX_AUTO_VERSIONS,
  restoreVersion,
  saveVersion,
  versionPdf,
} from "../src/server/cv/versions"
import { createEditableFromUpload, mergeUploadedCopies } from "../src/server/cv/structure"
import { applyCvSection, improveCvSection } from "../src/server/cv/improve"
import type { LlmClient } from "@newrole/llm/common"
import { eraseAccount } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"
import type { HttpClient } from "../src/server/security/safe-fetch"
import { syntheticCv } from "@newrole/cv-core/fixtures"
import { letterSection, type CvContent } from "@newrole/cv-core/schema"
import { readOnlyExcerpt } from "@newrole/cv-core/tailor"
import { companyConsent, consentCompanyOf, defaultConsent } from "@newrole/cv-core/blank"

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

/** The tailoring call itself: the steps before it read the offer and check the person's data. */
function tailorCall(llm: { calls: Call[] }): Call {
  const call = llm.calls.find((entry) => entry.purpose === "cv-tailor")
  assert.ok(call, "tailoring asked the model")
  return call
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
    tailorCall(llm).user.includes(`"headline":${JSON.stringify(base.content.header.headline)}`)
  )
  assert.ok(!llm.calls.some((call) => call.user.includes("Mój własny nagłówek")))
  assert.match(tailorCall(llm).user, /Attempt 2/, "a new attempt must not hit the reply cache")

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

/** A one-page PDF with each line on its own baseline (as in @newrole/profile's pdf.test.ts). */
function pdfWithLines(lines: string[]): Buffer {
  const stream = lines
    .map((line, index) => `BT /F1 12 Tf 72 ${720 - index * 20} Td (${line}) Tj ET`)
    .join("\n")
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ]
  let pdf = "%PDF-1.4\n"
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

const cvPdfFile = pdfWithLines([
  "Anna Example",
  "Head of Engineering",
  "I lead engineering teams and design platforms from the first plan to production.",
  "Experience",
  "Example Company, Head of Engineering, 2019 - 2024",
  "Built and led a team of twelve developers.",
])

async function uploaded(userId: number, title = "Moje CV") {
  return db.cvDocument.create({
    data: {
      userId,
      title,
      kind: "UPLOADED",
      isDefault: true,
      pdf: cvPdfFile,
      pdfName: `${title}.pdf`,
      pdfUpdatedAt: new Date(),
    },
  })
}

test("making an uploaded PDF editable keeps one CV, with the file as its original", async () => {
  const user = await makeUser()
  const upload = await uploaded(user.id)
  const { cv } = await createEditableFromUpload(user.id, upload.id, null)

  assert.equal(cv.id, upload.id, "the same CV")
  assert.equal(cv.kind, "EDITABLE")
  assert.equal(cv.language, "en", "the language of its text")
  assert.ok(cv.content)
  assert.equal(cv.original?.name, "Moje CV.pdf")
  assert.deepEqual(
    (await listCvs(user.id)).map((row) => row.id),
    [upload.id],
    "no second CV"
  )

  const versions = await listVersions(user.id, upload.id)
  assert.deepEqual(
    versions.map((version) => [version.number, version.origin, version.hasPdf]),
    [[0, "upload", true]]
  )
  const original = await versionPdf(user.id, upload.id, versions[0].id)
  assert.deepEqual(original?.bytes, cvPdfFile, "the uploaded file, byte for byte")
  assert.equal(await versionPdf((await makeUser()).id, upload.id, versions[0].id), null)

  // a second click changes nothing
  await createEditableFromUpload(user.id, upload.id, null)
  assert.equal((await listVersions(user.id, upload.id)).length, 1)

  // tailoring works from its content and never reads the file again
  const job = await makeJob()
  const llm = fakeLlm(tailorReply())
  await tailorCvForJob({ userId: user.id, jobId: job.id, llm })
  assert.match(tailorCall(llm).user, /Head of Engineering/)
  const tailored = await db.cvDocument.findFirst({
    where: { userId: user.id, jobId: job.id },
    select: { baseCvId: true },
  })
  assert.equal(tailored?.baseCvId, upload.id)
})

test("tailoring from a PDF not yet editable makes that same CV editable", async () => {
  const user = await makeUser()
  const upload = await uploaded(user.id)
  const job = await makeJob()
  // reading the PDF goes through the configured model; here it reads by rules
  const provider = process.env.LLM_PROVIDER
  process.env.LLM_PROVIDER = "none"
  try {
    await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  } finally {
    if (provider === undefined) delete process.env.LLM_PROVIDER
    else process.env.LLM_PROVIDER = provider
  }
  const cvs = (await listCvs(user.id)).filter((row) => !row.target)
  assert.deepEqual(
    cvs.map((row) => [row.id, row.kind]),
    [[upload.id, "EDITABLE"]],
    "the same CV, made editable"
  )
  assert.equal(cvs[0].original?.name, "Moje CV.pdf")
  const tailored = await db.cvDocument.findFirst({
    where: { userId: user.id, jobId: job.id },
    select: { baseCvId: true },
  })
  assert.equal(tailored?.baseCvId, upload.id)
})
test("an old PDF and its editable copy merge into one CV, nothing lost", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const upload = await uploaded(user.id, "CV_EN")
  const content = syntheticCv(1)
  content.header.headline = "Z kopii edytowalnej"
  // the shape before one CV was one document: a second CV whose base is the PDF
  const copy = await createCv({
    userId: user.id,
    from: "content",
    content,
    title: "CV_EN (editable)",
    baseCvId: upload.id,
  })
  await updateCv(user.id, copy.id, {
    content: { ...content, header: { ...content.header, headline: "Poprawione" } },
  })
  const letter = await createGeneralLetter({ userId: user.id, cvId: upload.id, from: "blank" })
  const { application } = await createApplication({
    userId: user.id,
    company: "Acme",
    title: "Staff Engineer",
    source: "nowarola",
    channel: "web",
    cvDocumentId: upload.id,
  })
  // a CV for an offer tailored from the PDF itself, before tailoring went through the copy
  const forOffer = await createCv({
    userId: user.id,
    from: "content",
    content,
    baseCvId: upload.id,
  })
  await db.cvDocument.update({
    where: { id: forOffer.id },
    data: { jobId: job.id, targetCompany: "Acme", targetTitle: "Staff Engineer" },
  })

  assert.equal(await mergeUploadedCopies(user.id), 1)
  assert.equal(await mergeUploadedCopies(user.id), 0, "once")

  assert.equal(await getCv(user.id, upload.id), null, "the PDF's own row is gone")
  const merged = await getCv(user.id, copy.id)
  assert.equal(merged?.title, "CV_EN", "the PDF's title")
  assert.equal(merged?.isDefault, true, "the PDF's place as the default")
  assert.equal(merged?.content?.header.headline, "Poprawione", "the edits stay")
  assert.equal(merged?.original?.name, "CV_EN.pdf")
  const versions = await listVersions(user.id, copy.id)
  const original = versions.find((version) => version.number === 0)
  assert.equal(original?.origin, "upload")
  assert.deepEqual((await versionPdf(user.id, copy.id, original!.id))?.bytes, cvPdfFile)
  assert.equal(
    (await getVersion(user.id, copy.id, original!.id))?.content.header.headline,
    "Z kopii edytowalnej",
    "version 0 is what was read from the PDF"
  )

  assert.equal((await getCv(user.id, letter.id))?.forCvId, copy.id, "the letter follows")
  const moved = await db.application.findUnique({
    where: { id: application.id },
    select: { cvDocumentId: true },
  })
  assert.equal(moved?.cvDocumentId, copy.id, "the application follows")
  const tailored = await db.cvDocument.findUnique({
    where: { id: forOffer.id },
    select: { baseCvId: true },
  })
  assert.equal(tailored?.baseCvId, copy.id, "a CV for an offer follows")
  assert.deepEqual(
    (await listCvs(user.id)).filter((row) => !row.target).map((row) => row.id),
    [copy.id]
  )
})

test("making an old PDF editable merges it with its copy instead of reading it again", async () => {
  const user = await makeUser()
  const upload = await uploaded(user.id)
  const copy = await createCv({
    userId: user.id,
    from: "content",
    content: syntheticCv(1),
    baseCvId: upload.id,
  })
  // no model and no PDF reading: the copy is already what was read
  const { cv } = await createEditableFromUpload(user.id, upload.id, fakeLlm(null))
  assert.equal(cv.id, copy.id)
  assert.equal(cv.original?.name, "Moje CV.pdf")
  assert.equal(await getCv(user.id, upload.id), null)

  // tailoring from the default does the same: one CV, the copy, is its base
  const other = await uploaded(user.id, "Drugie")
  const otherCopy = await createCv({
    userId: user.id,
    from: "content",
    content: syntheticCv(1),
    baseCvId: other.id,
  })
  await db.cvDocument.updateMany({ where: { userId: user.id }, data: { isDefault: false } })
  await db.cvDocument.update({ where: { id: other.id }, data: { isDefault: true } })
  const job = await makeJob()
  await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  const tailored = await db.cvDocument.findFirst({
    where: { userId: user.id, jobId: job.id },
    select: { baseCvId: true },
  })
  assert.equal(tailored?.baseCvId, otherCopy.id)
  assert.equal((await defaultCv(user.id))?.id, otherCopy.id, "the default moved with it")
})

test("an offer that opted out of AI never reaches the model; the person's own note does", async () => {
  const user = await makeUser()
  const secret = `Tajny opis oferty ${stamp}`
  const job = await makeJob({ description: secret, llmOptOut: true })
  await general(user.id)

  const llm = fakeLlm(tailorReply())
  const plain = await tailorCvForJob({ userId: user.id, jobId: job.id, llm })
  assert.ok(
    llm.calls.every((call) => !call.user.includes(secret)),
    "no step reads it"
  )
  assert.equal(llm.calls[0].purpose, "cv-tailor", "with no text there is no offer to analyse")
  assert.match(tailorCall(llm).user, /Staff Engineer/)
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
  assert.match(tailorCall(withNote).user, /Wymagania: Kubernetes/)
  assert.equal(withNote.calls[0].purpose, "offer-analysis", "the note may hold the offer's text")
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

  assert.ok(tailorCall(llm).user.includes(`Wymagamy Kubernetes ${stamp}`))
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
  assert.ok(tailorCall(llm).user.includes(excerpt))
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

const pastedLetter = [
  "Szanowni Państwo,",
  "",
  "od ośmiu lat buduję platformy dla dużych zespołów.",
  "",
  "Z wyrazami szacunku,",
  "Anna",
].join("\n")

test("a general CV gets one general letter, with its header, and the pair shows in the editor", async () => {
  const user = await makeUser()
  const base = await general(user.id)

  const blank = await createGeneralLetter({ userId: user.id, cvId: base.id, from: "blank" })
  assert.equal(blank.created, true)
  const again = await createGeneralLetter({
    userId: user.id,
    cvId: base.id,
    from: "text",
    text: "x",
  })
  assert.deepEqual(again, { id: blank.id, created: false }, "a CV keeps the letter it has")

  const letter = await getCv(user.id, blank.id)
  assert.equal(letter?.docType, "LETTER")
  assert.equal(letter?.forCvId, base.id)
  assert.equal(letter?.target, null)
  assert.equal(letter?.isDefault, false)
  assert.equal(letter?.content?.header.name, base.content.header.name)
  assert.deepEqual(letterSection(letter!.content!)?.paragraphs, [])

  // a letter never counts as a CV, nor as the default
  assert.deepEqual(
    (await listCvs(user.id)).map((row) => row.id),
    [base.id]
  )
  assert.equal((await defaultCv(user.id))?.id, base.id)

  const cvSide = await pairContext(user.id, (await getCv(user.id, base.id))!)
  assert.deepEqual(cvSide, { cvId: base.id, letterId: blank.id, notes: null })
  const letterSide = await pairContext(user.id, letter!)
  assert.equal(letterSide?.cvId, base.id)
  assert.equal(letterSide?.letterId, blank.id)
})

test("a pasted letter keeps the person's greeting and sign-off", async () => {
  const user = await makeUser()
  const base = await general(user.id)
  const { id } = await createGeneralLetter({
    userId: user.id,
    cvId: base.id,
    from: "text",
    text: pastedLetter,
  })
  const section = letterSection((await getCv(user.id, id))!.content!)
  assert.equal(section?.greeting, "Szanowni Państwo,")
  assert.deepEqual(section?.paragraphs, ["od ośmiu lat buduję platformy dla dużych zespołów."])
  assert.equal(section?.closing, "Z wyrazami szacunku,")
  assert.equal(section?.signature, "Anna")
  assert.equal(section?.recipient, "")
})

test("only a general CV gets a general letter", async () => {
  const user = await makeUser()
  const job = await makeJob()
  await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  await assert.rejects(
    createGeneralLetter({ userId: user.id, cvId: cv.id, from: "blank" }),
    (error: unknown) => error instanceof CvError && error.code === "not-general"
  )
  const other = await makeUser()
  await assert.rejects(
    createGeneralLetter({ userId: other.id, cvId: cv.id, from: "blank" }),
    (error: unknown) => error instanceof CvError && error.code === "not-found"
  )
})

test("the model writes a general letter for no offer, as a version, with what to check", async () => {
  const user = await makeUser()
  const base = await general(user.id)
  const llm = fakeLlm({ paragraphs: ["Buduję platformy.", "Skróciłem wdrożenia o 73%."] })
  const { id, created } = await writeGeneralLetterForCv({ userId: user.id, cvId: base.id, llm })
  assert.equal(created, true)
  assert.doesNotMatch(llm.calls[0].user, /untrusted_job/)
  const letter = await getCv(user.id, id)
  const section = letterSection(letter!.content!)
  assert.equal(section?.recipient, "")
  assert.equal(section?.subject, "")
  assert.deepEqual(
    (await listVersions(user.id, id)).map((version) => version.origin),
    ["generated"]
  )
  assert.deepEqual((await pairContext(user.id, letter!))?.notes?.unverified, ["73"])

  // a CV that has its letter gets it back without asking the model
  const unused = fakeLlm(null)
  assert.deepEqual(await writeGeneralLetterForCv({ userId: user.id, cvId: base.id, llm: unused }), {
    id,
    created: false,
  })
  assert.equal(unused.calls.length, 0)
})

test("a letter for an offer is made from the general letter of the CV it was tailored from", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const main = await general(user.id)
  const other = await createCv({ userId: user.id, from: "content", content: syntheticCv(1) })
  const mainLetter = await createGeneralLetter({
    userId: user.id,
    cvId: main.id,
    from: "text",
    text: pastedLetter,
  })
  await createGeneralLetter({
    userId: user.id,
    cvId: other.id,
    from: "text",
    // past letters count from 200 characters (letters.ts)
    text: `Dzień dobry,\n\nList do drugiego CV. ${"Prowadzę zespoły produktowe. ".repeat(
      8
    )}\n\nPozdrawiam,\nAnna`,
  })

  await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  assert.equal((await generalLetterForJob(user.id, job.id))?.id, mainLetter.id)

  const llm = fakeLlm(letterReply)
  const letter = await generateLetterForJob({ userId: user.id, jobId: job.id, llm })
  const user0 = llm.calls[0].user
  assert.match(user0, /<untrusted_general_letter>\nod ośmiu lat buduję platformy/)
  // the general letter is not one of the past letters too; the other CV's letter is
  assert.equal(user0.match(/od ośmiu lat buduję platformy/g)?.length, 1)
  assert.match(user0, /<untrusted_past_letter>\nList do drugiego CV/)
  const section = letterSection(letter.content)
  assert.equal(section?.greeting, "Szanowni Państwo,")
  assert.equal(section?.closing, "Z wyrazami szacunku,")
  assert.equal(section?.signature, "Anna")
  assert.match(section?.recipient ?? "", /^Acme/)

  // the letter for the offer stays with the offer, not with the CV
  const stored = await getCv(user.id, letter.id)
  assert.equal(stored?.forCvId, null)
  assert.equal(stored?.target?.jobId, job.id)
})

test("an uploaded PDF keeps its letter when it becomes editable", async () => {
  const user = await makeUser()
  const upload = await uploaded(user.id)
  // a letter for a PDF not yet editable takes its header from the profile, here none: blank
  const { id } = await createGeneralLetter({ userId: user.id, cvId: upload.id, from: "blank" })
  await createEditableFromUpload(user.id, upload.id, null)
  assert.equal((await generalLetterOf(user.id, upload.id))?.id, id)
  const job = await makeJob()
  await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  assert.equal((await generalLetterForJob(user.id, job.id))?.id, id)
})

test("a PDF that leaves stays in the history, once per content, and is never pruned", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  const pdf = (text: string) => ({ bytes: Buffer.from(`%PDF ${text}`), name: "Anna_CV.pdf" })

  await keepPdfVersion({ documentId: id, content, language: "pl", pdf: pdf("a") })
  let versions = await listVersions(user.id, id)
  assert.deepEqual(
    versions.map((version) => [version.origin, version.hasPdf, version.isCurrent]),
    [["pdf", true, true]]
  )
  // the same content again: nothing new
  await keepPdfVersion({ documentId: id, content, language: "pl", pdf: pdf("a") })
  assert.equal((await listVersions(user.id, id)).length, 1)

  // a version of the same content without a file takes it, and then is not pruned
  const edited = { ...content, header: { ...content.header, headline: "Nowa" } }
  await updateCv(user.id, id, { content: edited })
  await saveVersion(user.id, id)
  await keepPdfVersion({ documentId: id, content: edited, language: "pl", pdf: pdf("b") })
  versions = await listVersions(user.id, id)
  assert.equal(versions.length, 2)
  assert.deepEqual(
    versions.map((version) => [version.origin, version.hasPdf]),
    [
      ["manual", true],
      ["pdf", true],
    ]
  )
  assert.equal((await versionPdf(user.id, id, versions[0].id))?.bytes.toString(), "%PDF b")

  // an uploaded original never takes another file: a PDF made from it is a version of its own
  const upload = await uploaded(user.id)
  const { cv } = await createEditableFromUpload(user.id, upload.id, null)
  await keepPdfVersion({
    documentId: upload.id,
    content: cv.content!,
    language: "en",
    pdf: pdf("c"),
  })
  const fromUpload = await listVersions(user.id, upload.id)
  assert.deepEqual(
    fromUpload.map((version) => [version.number, version.origin]),
    [
      [1, "pdf"],
      [0, "upload"],
    ]
  )
  assert.deepEqual((await versionPdf(user.id, upload.id, fromUpload[1].id))?.bytes, cvPdfFile)
})

test("deleting a general CV takes its letter only when asked; a copy copies the pair", async () => {
  const user = await makeUser()
  const base = await general(user.id)
  const { id: letterId } = await createGeneralLetter({
    userId: user.id,
    cvId: base.id,
    from: "text",
    text: pastedLetter,
  })

  const copy = await duplicateCv(user.id, base.id)
  const copyLetter = await generalLetterOf(user.id, copy.id)
  assert.ok(copyLetter && copyLetter.id !== letterId, "the copy has a letter of its own")
  assert.equal(copyLetter.forCvId, copy.id)
  assert.equal(letterSection(copyLetter.content)?.signature, "Anna")

  await deleteCv(user.id, copy.id, { withLetter: true })
  assert.equal(await getCv(user.id, copyLetter.id), null)

  await deleteCv(user.id, base.id)
  const kept = await getCv(user.id, letterId)
  assert.ok(kept, "the letter stays without its CV")
  assert.equal(kept.forCvId, null)
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

test("an automatic version that keeps a PDF is not counted against the cap", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  const at = (i: number) => ({ ...content, header: { ...content.header, headline: `Wersja ${i}` } })
  await updateCv(user.id, id, { content: at(0) })
  // the first edit kept the state before it as an automatic version; it goes out as a PDF
  const [kept] = await listVersions(user.id, id)
  assert.equal(kept.origin, "auto")
  await updateCv(user.id, id, { content })
  await keepPdfVersion({
    documentId: id,
    content: (await getVersion(user.id, id, kept.id))!.content,
    language: "pl",
    pdf: { bytes: Buffer.from("%PDF"), name: "CV.pdf" },
  })
  for (let i = 1; i <= MAX_AUTO_VERSIONS + 1; i += 1) {
    await db.cvDocument.update({ where: { id }, data: { versionCheckedAt: new Date(0) } })
    await updateCv(user.id, id, { content: at(i) })
  }
  const versions = await listVersions(user.id, id)
  assert.ok(
    versions.some((version) => version.hasPdf),
    "the version that went out stays"
  )
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

test("saving a CV for an offer as general makes it the newest version of the CV it came from", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const base = await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  const edited = { ...cv.content, header: { ...cv.content.header, headline: "Poprawka na stałe" } }
  await updateCv(user.id, cv.id, { content: edited, language: "en" })
  const tailored = await getCv(user.id, cv.id)

  const context = await tailorContext(user.id, tailored!)
  assert.deepEqual(context?.general, { id: base.id, title: "Główne", language: "pl" })
  assert.deepEqual(context?.choices, [], "nothing to pick while its general CV is there")

  const saved = await saveToGeneralCv(user.id, cv.id)
  assert.deepEqual(saved, { cvId: base.id, title: "Główne", number: 2, created: false })
  const stored = await getCv(user.id, base.id)
  assert.deepEqual(stored?.content, tailored?.content)
  assert.equal(stored?.content?.header.headline, "Poprawka na stałe")
  assert.equal(stored?.language, "en")
  assert.equal(stored?.target, null, "it stays a general CV")
  assert.equal(stored?.title, "Główne")

  const versions = await listVersions(user.id, base.id)
  assert.deepEqual(
    versions.map((version) => [version.number, version.origin, version.isCurrent]),
    [
      [2, "offer", true],
      [1, "auto", false],
    ]
  )
  assert.match(versions[0].label ?? "", /^Acme .+ · Staff Engineer$/)
  assert.deepEqual((await getVersion(user.id, base.id, versions[1].id))?.content, base.content)

  // the same content again adds nothing
  assert.deepEqual(await saveToGeneralCv(user.id, cv.id), {
    cvId: base.id,
    title: "Główne",
    number: null,
    created: false,
  })
  assert.equal((await listVersions(user.id, base.id)).length, 2)

  // a name the person gives replaces the offer's
  const named = await saveVersion(user.id, base.id, "Na stałe")
  assert.equal(named?.version.origin, "manual")
  assert.equal(named?.version.label, "Na stałe")

  // only a CV for an offer, of this person, whose general CV is still there
  assert.equal(await saveToGeneralCv(user.id, base.id), null)
  assert.equal(await saveToGeneralCv((await makeUser()).id, cv.id), null)
  await deleteCv(user.id, base.id)
  assert.equal(await saveToGeneralCv(user.id, cv.id), null, "gone, and nothing picked")
  assert.equal((await tailorContext(user.id, tailored!))?.general, null)
})

test("a CV for an offer whose general CV is gone saves into a picked one, or a new one", async () => {
  const user = await makeUser()
  const job = await makeJob()
  const gone = await general(user.id)
  const cv = await tailorCvForJob({ userId: user.id, jobId: job.id, llm: fakeLlm(tailorReply()) })
  await deleteCv(user.id, gone.id)
  const other = await createCv({
    userId: user.id,
    from: "content",
    content: syntheticCv(1),
    title: "Inne",
  })
  const upload = await uploaded(user.id, "Tylko PDF")

  const context = await tailorContext(user.id, (await getCv(user.id, cv.id))!)
  assert.equal(context?.general, null)
  assert.deepEqual(
    context?.choices.map((choice) => choice.title),
    ["Inne"],
    "editable general CVs only: a PDF not yet editable cannot hold versions"
  )
  assert.equal(await saveToGeneralCv(user.id, cv.id, upload.id), null)

  const saved = await saveToGeneralCv(user.id, cv.id, other.id)
  assert.deepEqual(saved, { cvId: other.id, title: "Inne", number: 2, created: false })
  // from now on it is linked: the next save needs no pick
  const linked = await tailorContext(user.id, (await getCv(user.id, cv.id))!)
  assert.equal(linked?.general?.id, other.id)

  // another CV for an offer, its general CV gone too, becomes a general CV of its own
  const job2 = await makeJob()
  const second = await tailorCvForJob({
    userId: user.id,
    jobId: job2.id,
    baseCvId: other.id,
    llm: fakeLlm(tailorReply()),
  })
  await deleteCv(user.id, other.id)
  const made = await saveToGeneralCv(user.id, second.id, "new")
  assert.equal(made?.created, true)
  assert.equal(made?.number, null)
  const fresh = await getCv(user.id, made!.cvId)
  assert.equal(fresh?.target, null)
  assert.equal(fresh?.title, "Staff Engineer", "named after the role it was written for")
  assert.deepEqual(fresh?.content, (await getCv(user.id, second.id))?.content)
  assert.equal(
    (await tailorContext(user.id, (await getCv(user.id, second.id))!))?.general?.id,
    fresh?.id
  )
})

test("Popraw z AI shows a rewritten section first and stores it only when applied", async () => {
  const user = await makeUser()
  const { id, content } = await general(user.id)
  const llm = fakeLlm({
    section: { id: "profile", body: "Prowadzę zespoły inżynierskie i buduję platformy." },
    changes: ["Uprościłem zdania."],
  })
  const improved = await improveCvSection({
    userId: user.id,
    id,
    sectionId: "profile",
    mode: "polish",
    llm,
  })
  assert.equal(llm.calls[0].purpose, "cv-improve")
  assert.deepEqual(improved.changes, ["Uprościłem zdania."])
  assert.deepEqual(await getCv(user.id, id).then((cv) => cv?.content), content, "nothing stored")
  assert.equal((await listVersions(user.id, id)).length, 0)

  const applied = await applyCvSection(user.id, id, improved.section)
  const stored = await getCv(user.id, id)
  const profile = stored?.content?.sections.find((section) => section.id === "profile")
  assert.equal(
    profile?.type === "text" && profile.body,
    "Prowadzę zespoły inżynierskie i buduję platformy."
  )
  assert.deepEqual(
    stored?.content?.sections.map((section) => section.id),
    content.sections.map((section) => section.id),
    "every section in its place"
  )
  assert.equal(applied.updatedAt.getTime(), stored?.updatedAt.getTime())
  const versions = await listVersions(user.id, id)
  assert.deepEqual(
    versions.map((version) => version.origin),
    ["generated", "auto"]
  )
  assert.deepEqual(
    (await getVersion(user.id, id, versions[1].id))?.content,
    content,
    "the state before"
  )

  // a section of another type, an unknown one, someone else's CV, no model
  await assert.rejects(
    applyCvSection(user.id, id, { ...improved.section, id: "skills" }),
    (error: unknown) => error instanceof CvError && error.code === "invalid-content"
  )
  await assert.rejects(
    applyCvSection((await makeUser()).id, id, improved.section),
    (error: unknown) => error instanceof CvError && error.code === "not-found"
  )
  await assert.rejects(
    improveCvSection({ userId: user.id, id, sectionId: "education", mode: "polish", llm }),
    (error: unknown) => error instanceof CvError && error.code === "no-content"
  )
  await assert.rejects(
    improveCvSection({ userId: user.id, id, sectionId: "profile", mode: "polish", llm: null }),
    (error: unknown) => error instanceof CvError && error.code === "llm-unavailable"
  )
})

/** A model that answers each step by its purpose and remembers what it was asked. */
function stepLlm(replies: Record<string, unknown>): LlmClient & { calls: Call[] } {
  const calls: Call[] = []
  return {
    model: "fake",
    calls,
    async completeJson(args) {
      calls.push({ purpose: args.purpose, user: args.user, system: args.system })
      const data = replies[args.purpose]
      if (data == null) return null
      return { data: args.schema.parse(data), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const offerAnalysisReply = {
  role: "Inżynier platformy.",
  seniority: "Staff",
  requirements: [
    { text: "PostgreSQL", importance: "required", kind: "tool", keyword: "PostgreSQL" },
    { text: "Kubernetes w produkcji", importance: "required", kind: "tool", keyword: "Kubernetes" },
    { text: "Go", importance: "preferred", kind: "skill", keyword: "Go" },
    { text: "Komunikatywność", importance: "soft", kind: "soft" },
  ],
  keywords: [
    { term: "PostgreSQL", type: "hard", importance: "required" },
    { term: "Kubernetes", type: "hard", importance: "required" },
    { term: "Terraform", type: "hard", importance: "required" },
    { term: "Go", type: "hard", importance: "preferred" },
  ],
  responsibilities: ["Rozwój platformy"],
  redFlags: [
    { quote: "fast-paced", why: "Może oznaczać dużą presję." },
    { quote: "rockstar", why: "Kultura pracy ponad siły." },
  ],
  signals: ["Oferta wymienia narzędzia."],
}

const matchReply = {
  requirements: [
    {
      id: "r1",
      status: "met",
      evidence: "Node.js, PostgreSQL, Kubernetes",
      note: "Pokaż to na górze.",
    },
    { id: "r2", status: "met", evidence: "Kubernetes w chmurze od pięciu lat", note: "" },
    { id: "r3", status: "missing", gap: "minor", note: "Pokaż pokrewne języki." },
    { id: "r4", status: "partial", evidence: "", note: "" },
  ],
  strengths: [
    {
      title: "Platformy",
      why: "Oferta szuka osoby od platform.",
      evidence: "projektuję platformy",
    },
    { title: "Wymyślona mocna strona", why: "Bez pokrycia.", evidence: "zarządzałem 40 osobami" },
  ],
  emphasize: ["Zacznij od platformy."],
  talkingPoints: ["Platforma od planu do wdrożenia."],
}

const bulletsReply = {
  bullets: [
    {
      item: "job1",
      index: 1,
      issues: ["weak-verb"],
      rewrite:
        "Zaprojektowałem architekturę i przełożyłem potrzeby produktowe na plany techniczne.",
    },
    {
      item: "job1",
      index: 2,
      issues: ["no-number"],
      rewrite: "Ustaliłem standardy kodu dla 12 zespołów.",
      question: "Ilu zespołów dotyczyły standardy?",
    },
  ],
}

test("tailoring runs its steps in order and keeps what each found for the match dashboard", async () => {
  const user = await makeUser()
  const job = await makeJob({
    description:
      "Wymagamy PostgreSQL i Kubernetes w produkcji. Mile widziane: Go. Pracujemy w trybie fast-paced. Liczy się komunikatywność.",
  })
  await general(user.id)
  const llm = stepLlm({
    "offer-analysis": offerAnalysisReply,
    "cv-match": matchReply,
    "cv-tailor": tailorReply(),
    "cv-bullets": bulletsReply,
    "cover-letter": letterReply,
  })
  const updates: { step: string; state: string }[] = []
  const result = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm,
    locale: "pl",
    onStep: (update) => updates.push({ step: update.step, state: update.state }),
  })

  assert.deepEqual(
    llm.calls.map((call) => call.purpose),
    ["offer-analysis", "cv-match", "cv-tailor", "cv-bullets"]
  )
  assert.deepEqual(
    updates.filter((update) => update.state !== "running").map((update) => update.step),
    ["offer", "cv", "match", "tailor", "bullets", "ats", "facts"]
  )
  assert.ok(updates.every((update) => update.state === "running" || update.state === "done"))
  assert.match(tailorCall(llm).user, /untrusted_offer_analysis/, "tailoring builds on the match")
  assert.match(tailorCall(llm).user, /\[required; met\] PostgreSQL/)

  const match = result.notes.match
  assert.ok(match?.analysis && match.report && match.bullets)
  // what the offer does not say is dropped
  assert.deepEqual(
    match.analysis.keywords.map((item) => item.term),
    ["PostgreSQL", "Kubernetes", "Go"]
  )
  assert.deepEqual(
    match.analysis.redFlags.map((flag) => flag.quote),
    ["fast-paced"]
  )
  // evidence the CV does not have does not count
  assert.deepEqual(
    match.report.requirements.map((item) => item.status),
    ["met", "partial", "missing", "missing"]
  )
  assert.equal(match.report.requirements[1].evidence, "")
  assert.deepEqual(match.report.groups.required, { met: 1, partial: 1, total: 2, percent: 75 })
  assert.equal(match.report.groups.preferred.percent, 0)
  assert.equal(match.report.score, 53, "75 × 0.7 + 0 × 0.3")
  assert.equal(match.report.band, "stretch")
  assert.deepEqual(
    match.report.strengths.map((item) => item.title),
    ["Platformy"]
  )

  // a rewrite that adds a number is refused; the other lands, and the question stays
  const roles = result.content.sections.find((section) => section.type === "experience")
  assert.ok(roles?.type === "experience")
  assert.equal(roles.items[0].bullets[1], bulletsReply.bullets[0].rewrite)
  assert.doesNotMatch(roles.items[0].bullets[2], /12/)
  assert.ok(
    !result.notes.unverified.includes("Zaprojektowałem"),
    "a bullet's first word is not a name"
  )
  assert.equal(match.bullets.rewritten, 1)
  assert.equal(match.bullets.reverted, 1)
  assert.deepEqual(
    match.bullets.questions.map((item) => item.question),
    ["Ilu zespołów dotyczyły standardy?"]
  )
  assert.equal(match.cv.before.weakStart, 2)
  assert.equal(match.cv.after.weakStart, 1)
  assert.equal(match.ats.after.total, 2, "the required keywords")
  assert.equal(match.ats.after.found, 2)
  assert.equal(match.ats.after.score, 100)

  // stored with the CV, and the letter makes its points from it
  const stored = await tailorContext(user.id, (await getCv(user.id, result.id))!)
  assert.equal(stored?.notes?.match?.report?.score, 53)
  const letterSteps: string[] = []
  await generateLetterForJob({
    userId: user.id,
    jobId: job.id,
    llm,
    onStep: (update) => letterSteps.push(`${update.step}:${update.state}`),
  })
  const letterCall = llm.calls.find((call) => call.purpose === "cover-letter")
  assert.match(letterCall?.user ?? "", /Platformy: Oferta szuka osoby od platform\./)
  assert.deepEqual(letterSteps, ["letter:running", "letter:done", "letterFacts:done"])
})

test("a step that fails leaves its part empty and tailoring goes on", async () => {
  const user = await makeUser()
  const job = await makeJob({ description: "Wymagamy PostgreSQL." })
  await general(user.id)
  const updates: string[] = []
  const result = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    // the analysis and the bullet check get nothing usable; the match is never asked
    llm: stepLlm({ "cv-tailor": tailorReply() }),
    onStep: (update) => updates.push(`${update.step}:${update.state}`),
  })
  assert.ok(updates.includes("offer:failed"))
  assert.ok(updates.includes("match:skipped"))
  assert.ok(updates.includes("bullets:failed"))
  assert.ok(updates.includes("tailor:done"))
  assert.equal(result.notes.match?.analysis, null)
  assert.equal(result.notes.match?.report, null)
  assert.equal(result.notes.match?.bullets, null)
})

const roundReplies = () => ({
  "offer-analysis": offerAnalysisReply,
  "cv-match": matchReply,
  "cv-tailor": tailorReply(),
  "cv-bullets": bulletsReply,
})

test("each run keeps a round, and the next one works from the comments and the CV as it is", async () => {
  const user = await makeUser()
  const job = await makeJob({
    description:
      "Wymagamy PostgreSQL i Kubernetes w produkcji. Mile widziane: Go. Pracujemy w trybie fast-paced. Liczy się komunikatywność.",
  })
  await general(user.id)
  const first = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: stepLlm(roundReplies()),
    locale: "pl",
  })
  assert.deepEqual(
    (await listRounds(user.id, first.id))?.map((round) => [round.number, round.score]),
    [[1, 53]]
  )

  // comments on the newest round, one per point; empty text takes one out
  const comment = { documentId: first.id, round: 1, subject: "Go" }
  await saveMatchComment(user.id, {
    ...comment,
    kind: "requirement",
    key: "r3",
    text: "Piszę w Go od 2021 w projekcie Kite.",
  })
  await saveMatchComment(user.id, { ...comment, kind: "keyword", key: "Go", text: "Tak." })
  const comments = await saveMatchComment(user.id, {
    ...comment,
    kind: "keyword",
    key: "Go",
    text: " ",
  })
  assert.deepEqual(
    comments.map((item) => item.key),
    ["r3"]
  )

  // the person edits the CV for the offer; the next round starts from that, not the general CV
  const edited = { ...first.content, header: { ...first.content.header, headline: "Mój nagłówek" } }
  await db.cvDocument.update({ where: { id: first.id }, data: { content: edited } })

  const llm = stepLlm({
    "cv-match": {
      ...matchReply,
      requirements: matchReply.requirements.map((item) =>
        item.id === "r3" ? { id: "r3", status: "met", evidence: "Piszę w Go od 2021" } : item
      ),
    },
    "cv-tailor": tailorReply(),
    "cv-bullets": { bullets: [] },
  })
  const second = await nextMatchRound({
    userId: user.id,
    jobId: job.id,
    rewrite: true,
    llm,
    locale: "pl",
  })
  assert.equal(second.round, 2)
  assert.deepEqual(
    llm.calls.map((call) => call.purpose),
    ["cv-match", "cv-tailor", "cv-bullets"],
    "the offer's analysis of round 1 is kept"
  )
  const facts = await db.candidateFact.findMany({ where: { userId: user.id } })
  assert.deepEqual(
    facts.map((fact) => [fact.text, fact.topic, fact.jobId]),
    [["Piszę w Go od 2021 w projekcie Kite.", "Go", job.id]]
  )
  const matchCall = llm.calls.find((call) => call.purpose === "cv-match")
  assert.match(matchCall?.user ?? "", /- Piszę w Go od 2021 w projekcie Kite\./, "a fact")
  assert.match(matchCall?.user ?? "", /untrusted_candidate_comments/)
  assert.match(tailorCall(llm).user, /Requirement \(preferred; missing\): Go/)
  assert.match(tailorCall(llm).user, /Mój nagłówek/, "the CV as the person left it")
  // the fact is the person's data: it backs the requirement it answers
  const report = second.notes.match?.report
  assert.equal(report?.requirements.find((item) => item.id === "r3")?.status, "met")
  assert.equal(report?.groups.preferred.percent, 100)

  const kept = await getRound(user.id, first.id, 1)
  assert.equal(kept?.comments.length, 1, "round 1 keeps its comments")
  await assert.rejects(
    saveMatchComment(user.id, { ...comment, kind: "keyword", key: "Go", text: "Za późno." }),
    (error: unknown) => error instanceof CvError && error.code === "conflict"
  )

  // only checking again: the CV, its versions and when it changed stay as they were
  const versions = await db.cvVersion.count({ where: { documentId: first.id } })
  const before = await db.cvDocument.findUniqueOrThrow({
    where: { id: first.id },
    select: { content: true, updatedAt: true },
  })
  const check = stepLlm({ "cv-match": matchReply })
  const updates: string[] = []
  const third = await nextMatchRound({
    userId: user.id,
    jobId: job.id,
    rewrite: false,
    llm: check,
    onStep: (update) => updates.push(`${update.step}:${update.state}`),
  })
  assert.equal(third.round, 3)
  assert.deepEqual(
    check.calls.map((call) => call.purpose),
    ["cv-match"]
  )
  assert.ok(updates.includes("tailor:skipped") && updates.includes("bullets:skipped"))
  const after = await db.cvDocument.findUniqueOrThrow({
    where: { id: first.id },
    select: { content: true, updatedAt: true },
  })
  assert.deepEqual(after, before)
  assert.equal(await db.cvVersion.count({ where: { documentId: first.id } }), versions)
  assert.equal(await db.candidateFact.count({ where: { userId: user.id } }), 1)

  // the lists show the newest round
  assert.deepEqual((await matchScores(user.id, [first.id])).get(first.id), {
    score: 53,
    atsScore: 100,
    rounds: 3,
  })
  const offer = (await listOffers(user.id)).find((row) => row.jobId === job.id)
  assert.equal(offer?.match?.rounds, 3)
})

test("a CV tailored before rounds were kept gets its first round from its notes", async () => {
  const user = await makeUser()
  const job = await makeJob({ description: "Wymagamy PostgreSQL i Kubernetes. Mile widziane: Go." })
  await general(user.id)
  const first = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: stepLlm(roundReplies()),
  })
  await db.matchRound.deleteMany({ where: { documentId: first.id } })
  const { updatedAt } = await db.cvDocument.findUniqueOrThrow({
    where: { id: first.id },
    select: { updatedAt: true },
  })
  // a list reads the notes until then
  assert.equal((await matchScores(user.id, [first.id])).get(first.id)?.rounds, 1)

  // tailoring again keeps the old notes as round 1 before it adds round 2
  await tailorCvForJob({ userId: user.id, jobId: job.id, llm: stepLlm(roundReplies()) })
  const rounds = await listRounds(user.id, first.id)
  assert.deepEqual(
    rounds?.map((round) => round.number),
    [1, 2]
  )
  assert.equal(rounds?.[0].createdAt.getTime(), updatedAt.getTime())
})

test("the consent clause of a CV for an offer can name the company, and keeps it in the next round", async () => {
  const user = await makeUser()
  const job = await makeJob({ description: "Wymagamy PostgreSQL i Kubernetes. Mile widziane: Go." })
  const base = await general(user.id)
  const own = base.content.consent
  assert.ok(own, "the general CV has its own clause")

  const named = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: stepLlm(roundReplies()),
    consentCompany: "  Acme Sp. z o.o. ",
  })
  assert.equal(named.content.consent, companyConsent(named.language, "Acme Sp. z o.o."))
  const stored = await getCv(user.id, named.id)
  assert.equal(stored?.content?.consent, companyConsent(named.language, "Acme Sp. z o.o."))
  assert.equal(
    (await getCv(user.id, base.id))?.content?.consent,
    own,
    "the general CV stays as it was"
  )

  // the next round works on this CV and keeps its clause
  const next = await nextMatchRound({
    userId: user.id,
    jobId: job.id,
    rewrite: true,
    llm: stepLlm({
      "cv-match": matchReply,
      "cv-tailor": tailorReply(),
      "cv-bullets": { bullets: [] },
    }),
  })
  assert.equal(next.content.consent, companyConsent(named.language, "Acme Sp. z o.o."))

  // without a company, tailoring again from the general CV names none (translated, the clause
  // becomes the plain one in the CV's language, as before)
  const again = await tailorCvForJob({
    userId: user.id,
    jobId: job.id,
    llm: stepLlm(roundReplies()),
  })
  assert.equal(consentCompanyOf(again.content.consent), null)
  assert.equal(again.content.consent, again.language === "pl" ? own : defaultConsent("en"))
})
