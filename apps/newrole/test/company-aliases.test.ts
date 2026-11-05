import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { offerStatus } from "../src/server/applications/offer-status"
import { companyMapFor, syncCompanyAliases } from "../src/server/companies/aliases"

const db = new PrismaClient()
const stamp = `aliases${Date.now()}`
const Acme = `Acme${stamp}`

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.company.deleteMany({ where: { name: { contains: stamp } } })
}

after(async () => {
  await cleanup()
  await db.$disconnect()
})

const sync = (curated?: { company: string; aliases: string[] }[]) => syncCompanyAliases({ curated })

test("the sync fills the company map, and a row switched off stays off", async () => {
  const one = await db.company.create({
    data: { name: Acme, normalizedName: `${stamp}-one` },
  })
  const two = await db.company.create({
    data: { name: `${Acme} - English`, normalizedName: `${stamp}-two` },
  })
  const mine = () => db.companyAlias.count({ where: { companyId: { in: [one.id, two.id] } } })

  await sync()
  assert.equal(await mine(), 2)
  await sync()
  assert.equal(await mine(), 2, "a second run adds nothing")

  const key = Acme.toLowerCase()
  const map = await companyMapFor([Acme])
  assert.deepEqual([...(map.get(key) ?? [])].sort(), [one.id, two.id].sort())

  await db.companyAlias.updateMany({
    where: { companyId: two.id, normalizedAlias: key },
    data: { confidence: 0 },
  })
  await sync()
  const after = await companyMapFor([Acme])
  assert.deepEqual([...(after.get(key) ?? [])], [one.id])
  const row = await db.companyAlias.findFirst({
    where: { companyId: two.id, normalizedAlias: key },
  })
  assert.equal(row?.confidence, 0, "the sync does not bring it back")
})

test("an alias the plan no longer makes is switched off, the pipeline's own row stays", async () => {
  const name = `Mangopay${stamp}`
  const company = await db.company.create({
    data: { name, normalizedName: `mangopay ${stamp}` },
  })
  // What the search pipeline writes for a company it creates: keyed by normalizedName.
  await db.companyAlias.create({
    data: { companyId: company.id, alias: name, normalizedAlias: `mangopay ${stamp}` },
  })
  const alias = `nethone${stamp}`
  const curated = [{ company: name, aliases: [`Nethone${stamp}`] }]
  const row = (normalizedAlias: string) =>
    db.companyAlias.findUniqueOrThrow({
      where: { companyId_normalizedAlias: { companyId: company.id, normalizedAlias } },
    })

  await sync(curated)
  assert.equal((await row(alias)).confidence, 1)
  assert.deepEqual([...((await companyMapFor([`Nethone${stamp}`])).get(alias) ?? [])], [company.id])

  // Taken out of config/company-aliases.ts.
  const result = await sync([])
  assert.ok(result.switchedOff >= 1)
  assert.equal((await row(alias)).confidence, 0)
  assert.equal((await companyMapFor([`Nethone${stamp}`])).get(alias), undefined)
  assert.equal((await row(`mangopay ${stamp}`)).confidence, 1, "the pipeline's row stays")
  assert.equal((await row(name.toLowerCase())).confidence, 1, "the name row stays")

  await sync(curated)
  assert.equal((await row(alias)).confidence, 0, "switched off for good, like a wrong row")
})

test("an offer finds the application through the map, a role and an address", async () => {
  const user = await db.user.create({ data: { email: `${stamp}@example.com`, role: "USER" } })
  const company = await db.company.create({
    data: { name: `Text ${stamp}`, normalizedName: `${stamp}-text` },
  })
  await db.companyAlias.create({
    data: {
      companyId: company.id,
      alias: `LiveChat ${stamp}`,
      normalizedAlias: `livechat${stamp}`,
      confidence: 1,
    },
  })
  await db.companyAlias.create({
    data: {
      companyId: company.id,
      alias: `Text ${stamp}`,
      normalizedAlias: `text${stamp}`,
      confidence: 1,
    },
  })
  const url = "https://www.linkedin.com/jobs/search/?currentJobId=7654321"
  await db.application.create({
    data: {
      userId: user.id,
      company: `LiveChat ${stamp}`,
      title: "Staff Software Engineer",
      url,
      status: "REJECTED",
      closedAtStage: "INTERVIEW",
      source: "extension",
    },
  })

  const byAddress = await offerStatus(user.id, {
    url: "https://www.linkedin.com/jobs/view/staff-at-acme-7654321/",
  })
  assert.equal(byAddress.applied?.match, "url")
  assert.equal(byAddress.applied?.statusLabel, "Odrzucono po: Rozmowy")
  assert.equal(byAddress.applied?.tone, "danger")

  const byRole = await offerStatus(user.id, {
    url: "https://justjoin.it/job-offer/1",
    company: `Text ${stamp}`,
    title: "Staff Software Developer",
  })
  assert.equal(byRole.applied?.match, "role")
  assert.equal(byRole.applied?.companyMatch, "same")

  const otherRole = await offerStatus(user.id, {
    url: "https://justjoin.it/job-offer/2",
    company: `Text ${stamp}`,
    title: "Data Analyst",
  })
  assert.equal(otherRole.applied, null)
  assert.equal(otherRole.sameCompany.length, 1)

  const otherCompany = await offerStatus(user.id, {
    url: "https://justjoin.it/job-offer/3",
    company: `Globex ${stamp}`,
    title: "Staff Software Engineer",
  })
  assert.deepEqual(otherCompany, { applied: null, sameCompany: [] })
})
