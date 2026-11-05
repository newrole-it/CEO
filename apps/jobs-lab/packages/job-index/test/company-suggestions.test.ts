import "./only-test-db"
import assert from "node:assert/strict"
import { after, test } from "node:test"
import { PrismaClient } from "@newrole/jobs-lab-db"
import { companySuggestions } from "../src/discovery/similar-companies"

const db = new PrismaClient()
const stamp = `suggest${Date.now()}`
const LIMIT = 1000

async function cleanup() {
  await db.user.deleteMany({ where: { email: { contains: stamp } } })
  await db.job.deleteMany({ where: { identityKey: { contains: stamp } } })
  await db.company.deleteMany({ where: { name: { contains: stamp } } })
}

after(async () => {
  await cleanup()
  await db.$disconnect()
})

let jobSeq = 0
async function company(
  label: string,
  title: string,
  offers = 1,
  place: { locationText: string; countryCode: string | null } = {
    locationText: "Warszawa, Polska",
    countryCode: "PL",
  }
) {
  const row = await db.company.create({
    data: { name: `${label}${stamp}`, normalizedName: `${label}-${stamp}`.toLowerCase() },
  })
  let firstJobId = ""
  for (let i = 0; i < offers; i += 1) {
    const key = `${stamp}-${(jobSeq += 1)}`
    const job = await db.job.create({
      data: {
        companyId: row.id,
        sourceType: "LEVER",
        title,
        normalizedTitle: title.toLowerCase(),
        summary: title,
        descriptionText: title,
        locationText: place.locationText,
        countryCode: place.countryCode,
        isTechRole: true,
        classifiedAt: new Date(),
        originalUrl: `https://example.com/jobs/${key}`,
        canonicalUrl: `https://example.com/jobs/${key}`,
        contentHash: `hash-${key}`,
        identityKey: key,
        fingerprint: `fp-${key}`,
      },
    })
    firstJobId ||= job.id
  }
  return { id: row.id, jobId: firstJobId }
}

test("a new account gets companies from the index, from likes down to the biggest employers", async () => {
  const user = await db.user.create({ data: { email: `${stamp}@example.com`, role: "USER" } })
  const kafka = await company("Kafkaco", "Kafka Engineer")
  const big = await company("Bigco", "Frontend Developer", 3)
  const watched = await company("Watchedco", "Kafka Engineer")
  await db.watchedCompany.create({
    data: { userId: user.id, companyId: watched.id, source: "user" },
  })

  const hiring = await companySuggestions(user.id, LIMIT)
  assert.equal(hiring.status, "ok")
  assert.equal(hiring.basis, "hiring", "no profile and no likes")
  const bigCard = hiring.suggestions.find((item) => item.companyId === big.id)
  assert.equal(bigCard?.openJobs, 3)
  assert.equal(bigCard?.why?.kind, "hiring")
  assert.ok(
    !hiring.suggestions.some((item) => item.companyId === watched.id),
    "a watched company is not suggested"
  )

  await db.candidateProfile.create({
    data: { userId: user.id, currentTitle: "Platform Specialist", skills: ["Kafka"] },
  })
  const fromProfile = await companySuggestions(user.id, LIMIT)
  assert.equal(fromProfile.basis, "profile")
  const fit = fromProfile.suggestions.find((item) => item.companyId === kafka.id)
  assert.deepEqual(fit?.why, { kind: "profile", matching: 1, terms: ["Kafka"] })
  assert.ok(
    !fromProfile.suggestions.some((item) => item.companyId === big.id),
    "a company with nothing that fits is left out"
  )

  await db.offerFeedback.create({ data: { userId: user.id, jobId: kafka.jobId, verdict: "LIKE" } })
  await company("Twinco", "Kafka Engineer")
  const fromLikes = await companySuggestions(user.id, LIMIT)
  assert.equal(fromLikes.basis, undefined, "likes come first")
  assert.ok(fromLikes.suggestions.length > 0)
  assert.equal(
    fromLikes.suggestions.some((item) => item.companyId === kafka.id),
    false
  )
})

test("the index fallback leaves out what the person liked and what is not in their country", async () => {
  const user = await db.user.create({ data: { email: `liked-${stamp}@example.com`, role: "USER" } })
  // Where they look for work, and nothing the profile ranking could use, so the basis stays "hiring".
  await db.candidateProfile.create({ data: { userId: user.id, homeCity: "Warszawa" } })
  // A liked company nothing in the index resembles, so the likes give no suggestion of their own.
  const liked = await company("Likedco", `Qzx${stamp} Wrangler`, 5)
  const both = await company("Bothco", `Vbn${stamp} Herder`, 5)
  await db.offerFeedback.create({ data: { userId: user.id, jobId: liked.jobId, verdict: "LIKE" } })
  // One offer liked, another disliked: out on this path as on the likes path.
  const [first, second] = await db.job.findMany({ where: { companyId: both.id }, take: 2 })
  await db.offerFeedback.createMany({
    data: [
      { userId: user.id, jobId: first.id, verdict: "LIKE" },
      { userId: user.id, jobId: second.id, verdict: "DISLIKE" },
    ],
  })
  // "gdansk" in a Berlin street name passes the database filter, not the browse page's.
  const berlin = await company("Berlinco", "Frontend Developer", 5, {
    locationText: "Gdanskstrasse 5, Berlin, Germany",
    countryCode: null,
  })
  const polish = await company("Polishco", "Frontend Developer", 5)

  const result = await companySuggestions(user.id, LIMIT)
  assert.equal(result.basis, "hiring")
  const ids = result.suggestions.map((item) => item.companyId)
  assert.ok(ids.includes(polish.id), "a company hiring in Poland is suggested")
  assert.ok(!ids.includes(liked.id), "a liked company is not suggested back")
  assert.ok(!ids.includes(both.id), "a company both liked and disliked is not suggested")
  assert.ok(!ids.includes(berlin.id), "an office abroad is not hiring in Poland")
  assert.deepEqual(result.suggestions.find((item) => item.companyId === polish.id)?.why, {
    kind: "hiring",
    country: "PL",
  })

  // Without a place in the profile, every country counts.
  const anywhere = await db.user.create({
    data: { email: `anywhere-${stamp}@example.com`, role: "USER" },
  })
  const open = await companySuggestions(anywhere.id, 50)
  const openIds = open.suggestions.map((item) => item.companyId)
  assert.ok(openIds.includes(berlin.id), "with no country, an office in Berlin counts")
  assert.equal(open.message, "Hiring the most.")
})
