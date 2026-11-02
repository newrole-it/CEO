import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { importCsv } from "../src/server/applications/sheet"

const db = new PrismaClient()
const stamp = `sheetimp${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { identityKey: { contains: stamp } } })
  await db.company.deleteMany({ where: { name: { contains: stamp } } })
  await db.$disconnect()
})

async function offer(company: string, title: string, salary: [number, number] | null) {
  const row = await db.company.create({
    data: { name: company, normalizedName: company.toLowerCase() },
  })
  const key = `${stamp}-${title}`
  return db.job.create({
    data: {
      companyId: row.id,
      sourceType: "LEVER",
      title,
      normalizedTitle: title.toLowerCase(),
      summary: title,
      descriptionText: title,
      locationText: "Warszawa, Polska",
      countryCode: "PL",
      salaryMin: salary?.[0] ?? null,
      salaryMax: salary?.[1] ?? null,
      salaryCurrency: salary ? "PLN" : null,
      originalUrl: `https://example.com/jobs/${key}`,
      canonicalUrl: `https://example.com/jobs/${key}`,
      contentHash: `hash-${key}`,
      identityKey: key,
      fingerprint: `fp-${key}`,
    },
  })
}

test("a CSV in the person's own columns becomes applications, linked to indexed offers", async () => {
  const user = await db.user.create({ data: { email: `${stamp}@example.com`, role: "USER" } })
  const company = `Firma${stamp}`
  const job = await offer(company, "Engineering Manager", [25000, 32000])
  const csv = [
    "Lp.;Data aplikacji;Firma;Stanowisko;Lokalizacja / tryb;Źródło;Status;Ostatnia aktualizacja;Następny krok / uwagi",
    `1;15.10.2026;${company};Engineering Manager;Kraków (hybrydowo);Just Join IT;Odrzucono;20.10.2026;Bez feedbacku`,
    `2;16.10.2026;Inna${stamp};Head of Product;–;LinkedIn;Czekam na feedback;;`,
    `3;16.10.2026;Inna${stamp};Head of Product;–;LinkedIn;Czekam na feedback;;`,
    "4;;;;;;;;",
  ].join("\n")

  const first = await importCsv(user.id, csv)
  assert.deepEqual(first, { created: 2, skipped: 1 })

  const apps = await db.application.findMany({
    where: { userId: user.id },
    orderBy: { appliedAt: "asc" },
  })
  assert.equal(apps.length, 2)
  assert.equal(apps[0].jobId, job.id)
  assert.equal(apps[0].url, job.originalUrl)
  assert.equal(apps[0].salaryText, "25 000–32 000 PLN")
  assert.equal(apps[0].location, "Kraków (hybrydowo)")
  assert.equal(apps[0].origin, "Just Join IT")
  assert.equal(apps[0].status, "REJECTED")
  assert.equal(apps[0].notes, "Bez feedbacku")
  assert.equal(apps[0].source, "csv")
  assert.equal(apps[1].jobId, null)
  assert.equal(apps[1].status, "APPLIED")
  assert.equal(apps[1].stageNote, "Czekam na feedback")

  // The same file again adds nothing.
  assert.deepEqual(await importCsv(user.id, csv), { created: 0, skipped: 3 })
})
