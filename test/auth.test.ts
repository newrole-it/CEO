import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import getSearch from "../src/app/searches/queries/getSearch"
import {
  consumeMagicLink,
  issueMagicLink,
  MAGIC_LINK_EMAIL_LIMIT,
} from "../src/server/auth/magic-link"

const db = new PrismaClient()
const stamp = Date.now()

function ctxFor(userId: number) {
  return {
    session: {
      userId,
      $authorize() {
        if (!this.userId) throw new Error("unauthorized")
      },
    },
  }
}

before(async () => {
  await db.loginLink.deleteMany({ where: { email: { contains: `auth-${stamp}` } } })
})

after(async () => {
  await db.user.deleteMany({ where: { email: { contains: `auth-${stamp}` } } })
  await db.loginLink.deleteMany({ where: { email: { contains: `auth-${stamp}` } } })
  await db.authRateLimit.deleteMany({ where: { key: { contains: `auth-${stamp}` } } })
  await db.$disconnect()
})

test("magic link expires and is single use", async () => {
  const email = `once-auth-${stamp}@example.com`
  const token = await issueMagicLink(email, `ip-once-auth-${stamp}`)
  assert.equal(await consumeMagicLink(token), email)
  assert.equal(await consumeMagicLink(token), null)

  const expired = await issueMagicLink(email, `ip-exp-auth-${stamp}`)
  await db.loginLink.updateMany({
    where: { email, usedAt: null },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  assert.equal(await consumeMagicLink(expired), null)
})

test("magic link rate limit trips after the email cap and for a hot IP", async () => {
  const email = `rate-auth-${stamp}@example.com`
  for (let i = 0; i < MAGIC_LINK_EMAIL_LIMIT; i += 1) {
    await issueMagicLink(email, `ip-rate-${i}-auth-${stamp}`)
  }
  await assert.rejects(() => issueMagicLink(email, `ip-rate-final-auth-${stamp}`))

  const ip = `ip-cap-auth-${stamp}`
  await db.authRateLimit.create({
    data: { key: `ip:${ip}`, windowStart: new Date(), count: 20 },
  })
  await assert.rejects(() => issueMagicLink(`fresh-auth-${stamp}@example.com`, ip))
})

test("a user cannot read another user's search", async () => {
  const owner = await db.user.create({
    data: { email: `owner-auth-${stamp}@example.com`, role: "USER" },
  })
  const other = await db.user.create({
    data: { email: `other-auth-${stamp}@example.com`, role: "USER" },
  })
  const search = await db.savedSearch.create({
    data: {
      userId: owner.id,
      name: "Head of Engineering",
      phrase: "Head of Engineering",
      targetTitles: [],
      includedKeywords: [],
      excludedKeywords: [],
      seniority: [],
    },
  })
  await assert.rejects(() => getSearch({ id: search.id }, ctxFor(other.id) as never))
  const visible = await getSearch({ id: search.id }, ctxFor(owner.id) as never)
  assert.equal(visible.search.phrase, "Head of Engineering")
})
