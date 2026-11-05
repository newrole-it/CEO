import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import { buildListedJob } from "@newrole/ats/adapters/parse"
import { loadTailorJob } from "../src/server/cv/tailor"
import { ingestOfferPayload } from "../src/server/offers/ingest"
import {
  addOfferByLink,
  confirmOffer,
  getOffer,
  listOffers,
  removeOffer,
  updateOffer,
} from "../src/server/offers/service"
import { storeOffer } from "../src/server/offers/store"
import { eraseAccount } from "../src/server/privacy/erase"
import { exportAccount } from "../src/server/privacy/export"

const db = new PrismaClient()
const stamp = `offers-${Date.now()}`

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { originalUrl: { contains: stamp } } })
  await db.company.deleteMany({ where: { normalizedName: { contains: stamp.replace(/-/g, " ") } } })
  await db.$disconnect()
})

let counter = 0

async function makeUser() {
  counter += 1
  return db.user.create({ data: { email: `u${counter}-${stamp}@example.com`, role: "USER" } })
}

const POSTING =
  "Szukamy Senior Backend Developera. Obowiązki: projektowanie usług w Go, praca z Kafka i Postgres. " +
  "Wymagania: 5 lat doświadczenia, Kubernetes, angielski B2. Mile widziane: Terraform. ".repeat(6)

function listed(id: number) {
  const job = buildListedJob({
    title: "Senior Backend Developer",
    companyName: `Acme ${stamp}`,
    locationText: "Warszawa",
    descriptionText: POSTING,
    originalUrl: `https://jobs.lever.co/acme-${stamp}/${id}`,
    sourceType: "LEVER",
    sourceBoardId: `acme-${stamp}`,
    externalId: `lever:${id}`,
    needsHydration: false,
  })
  assert.ok(job)
  return job
}

test("an offer added by its link keeps its whole text for that person only", async () => {
  const [anna, ben] = [await makeUser(), await makeUser()]
  const stored = await storeOffer(listed(1))
  assert.equal(stored.created, true)
  const job = await db.job.findUniqueOrThrow({ where: { id: stored.id } })
  // the shared row keeps an excerpt, as an index would
  assert.ok(job.descriptionText.length <= 300, "Job keeps at most 300 characters")

  const check = await addOfferByLink(anna.id, job.originalUrl, {
    findByUrl: async () => null,
    ingest: async () => ({ status: "created", jobId: job.id, message: "read", text: POSTING }),
    findById: async (id) =>
      id === job.id
        ? {
            id: job.id,
            title: job.title,
            originalUrl: job.originalUrl,
            canonicalUrl: job.canonicalUrl,
            locationText: job.locationText,
            salaryMin: null,
            salaryMax: null,
            salaryCurrency: null,
            company: { name: `Acme ${stamp}` },
          }
        : null,
    model: async () => {
      throw new Error("the model must not be used")
    },
  })
  assert.equal(check.kind, "added")
  if (check.kind !== "added") return
  assert.equal(check.jobId, job.id)
  assert.equal(check.textChars, POSTING.trim().length)

  const mine = await getOffer(anna.id, job.id)
  assert.equal(mine?.text, POSTING.trim())
  assert.equal(mine?.textOrigin, "full")
  assert.equal((await getOffer(ben.id, job.id))?.text, null, "another person sees no copy")
  assert.deepEqual(
    (await listOffers(anna.id)).map((offer) => offer.jobId),
    [job.id]
  )
  assert.deepEqual(await listOffers(ben.id), [])

  // tailoring reads the person's copy, not the excerpt
  const tailor = await loadTailorJob(job.id, undefined, anna.id)
  assert.equal(tailor?.origin, "full")
  assert.equal(tailor?.text, POSTING.trim())

  await updateOffer(anna.id, job.id, { text: "Wklejona treść oferty.", note: "Zadzwonić w piątek" })
  const edited = await getOffer(anna.id, job.id)
  assert.equal(edited?.text, "Wklejona treść oferty.")
  assert.equal(edited?.textOrigin, "pasted")
  assert.equal(edited?.note, "Zadzwonić w piątek")

  const exported = await exportAccount(anna.id)
  assert.equal(exported?.offers.length, 1)
  assert.equal(exported?.offers[0]?.text, "Wklejona treść oferty.")

  await removeOffer(anna.id, job.id)
  assert.deepEqual(await listOffers(anna.id), [])
  assert.ok(await db.job.findUnique({ where: { id: job.id } }), "the shared offer stays")
})

test("the same link stored twice is one offer", async () => {
  const first = await storeOffer(listed(2))
  const again = await storeOffer(listed(2))
  assert.equal(again.id, first.id)
  assert.equal(again.created, false)
})

test("a draft the person checked is kept with the text they gave", async () => {
  const user = await makeUser()
  const result = await confirmOffer(
    user.id,
    {
      url: `https://www.example.com/kariera/${stamp}`,
      company: `Example ${stamp}`,
      title: "QA Engineer",
      text: "Testy automatyczne w Playwright. Wymagamy TypeScript.",
      textOrigin: "full",
    },
    ingestOfferPayload
  )
  assert.ok("jobId" in result)
  if (!("jobId" in result)) return
  const offer = await getOffer(user.id, result.jobId)
  assert.equal(offer?.title, "QA Engineer")
  assert.equal(offer?.text, "Testy automatyczne w Playwright. Wymagamy TypeScript.")
  assert.equal(offer?.textOrigin, "full")
})

test("LinkedIn is refused before anything is read", async () => {
  const user = await makeUser()
  const never = async () => {
    throw new Error("nothing may be read")
  }
  assert.deepEqual(
    await addOfferByLink(user.id, "https://www.linkedin.com/jobs/view/1", {
      findByUrl: never,
      ingest: never,
      model: never,
    }),
    { kind: "refused" }
  )
  assert.deepEqual(await addOfferByLink(user.id, "no link here"), { kind: "invalid" })
})

test("erasing the account deletes the person's copies", async () => {
  const user = await makeUser()
  const stored = await storeOffer(listed(3))
  await updateOffer(user.id, stored.id, { text: "Moja kopia." })
  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 1)
  await eraseAccount(user.id)
  assert.equal(await db.userOffer.count({ where: { userId: user.id } }), 0)
})
