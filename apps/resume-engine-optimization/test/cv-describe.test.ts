import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { pgAdapter } from "../db/client"
import type { LlmClient } from "@newrole/llm/common"
import { createCvFromDescription } from "../src/server/cv/describe"
import { CvError, listCvs } from "../src/server/cv/service"

const db = new PrismaClient({ adapter: pgAdapter() })
const stamp = `describe-${Date.now()}`
const users: number[] = []

after(async () => {
  await db.authRateLimit.deleteMany({
    where: { key: { in: users.map((id) => `cv-describe:${id}`) } },
  })
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.$disconnect()
})

let counter = 0

async function makeUser(data: { name?: string; applicant?: object } = {}) {
  counter += 1
  const user = await db.user.create({
    data: { email: `u${counter}-${stamp}@example.com`, role: "USER", ...data },
  })
  users.push(user.id)
  return user
}

type Call = { purpose: string; system: string; user: string }

function fakeLlm(reply: unknown): LlmClient & { calls: Call[] } {
  const calls: Call[] = []
  return {
    model: "fake",
    calls,
    async completeJson(args) {
      calls.push({ purpose: args.purpose, user: args.user, system: args.system })
      if (reply == null) return null
      return { data: args.schema.parse(reply), tokenInput: 0, tokenOutput: 0, cached: false }
    },
    async completeText() {
      return null
    },
  }
}

const description =
  "Od 2021 pracuję w sklepie Zielony Koszyk jako specjalista obsługi klienta. Odpowiadam za czat i reklamacje. Znam Zendesk. Angielski B2."

const written = {
  name: "",
  headline: "Specjalista obsługi klienta",
  location: "",
  email: "",
  phone: "",
  links: [],
  sections: [
    {
      type: "experience",
      title: "Doświadczenie zawodowe",
      items: [
        {
          company: "Zielony Koszyk",
          role: "Specjalista obsługi klienta",
          dates: "2021–obecnie",
          summary: "",
          bullets: ["Odpowiadam za czat i reklamacje."],
          tech: "Zendesk",
        },
      ],
    },
    { type: "text", title: "Języki", body: "Angielski B2" },
  ],
}

test("a description becomes a new editable CV in its own language, contact details from the account", async () => {
  const user = await makeUser({ name: "Ola Testowa", applicant: { phone: "+48 500 100 200" } })
  const llm = fakeLlm(written)
  const { cv, reader } = await createCvFromDescription(user.id, description, llm)

  assert.equal(reader, "llm")
  assert.equal(llm.calls.length, 1)
  assert.equal(llm.calls[0].purpose, "cv-describe")
  assert.match(llm.calls[0].system, /Write the CV in Polish/)
  assert.ok(llm.calls[0].user.startsWith("<untrusted_description>\n"), "the text is data")
  assert.ok(llm.calls[0].user.includes(description))

  assert.equal(cv.kind, "EDITABLE")
  assert.equal(cv.language, "pl")
  assert.equal(cv.isDefault, true, "the person's first CV")
  assert.equal(cv.content?.header.name, "Ola Testowa")
  assert.equal(cv.content?.header.email, user.email)
  assert.equal(cv.content?.header.phone, "+48 500 100 200")
  assert.equal(cv.content?.header.headline, "Specjalista obsługi klienta")
  assert.deepEqual(
    cv.content?.sections.map((section) => section.title),
    ["Doświadczenie zawodowe", "Języki"]
  )
  assert.deepEqual(
    (await listCvs(user.id)).map((row) => row.id),
    [cv.id]
  )
})

test("what the description says about the person wins over the account", async () => {
  const user = await makeUser({ name: "Ola Testowa" })
  const llm = fakeLlm({ ...written, name: "Aleksandra Testowa", email: "ola@example.com" })
  const { cv } = await createCvFromDescription(user.id, description, llm)
  assert.equal(cv.content?.header.name, "Aleksandra Testowa")
  assert.equal(cv.content?.header.email, "ola@example.com")
})

test("without a model the description is the CV's one section", async () => {
  const user = await makeUser()
  const { cv, reader } = await createCvFromDescription(
    user.id,
    "I have worked at a bakery since 2020 and I run its online orders.",
    null
  )
  assert.equal(reader, "text")
  assert.equal(cv.language, "en")
  assert.equal(cv.content?.sections.length, 1)
  assert.match(JSON.stringify(cv.content?.sections[0]), /run its online orders/)
})

test("a description that is too short writes nothing, and the hourly limit holds", async () => {
  const user = await makeUser()
  await assert.rejects(
    () => createCvFromDescription(user.id, "  krótko  ", fakeLlm(written)),
    (error) => error instanceof CvError && error.code === "no-content"
  )
  assert.equal((await listCvs(user.id)).length, 0)

  await db.authRateLimit.create({
    data: { key: `cv-describe:${user.id}`, windowStart: new Date(), count: 20 },
  })
  const llm = fakeLlm(written)
  await assert.rejects(
    () => createCvFromDescription(user.id, description, llm),
    (error) => error instanceof CvError && error.code === "limited"
  )
  assert.equal(llm.calls.length, 0, "the model is not asked")
  assert.equal((await listCvs(user.id)).length, 0)
})
