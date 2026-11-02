import "./only-test-db"
import assert from "node:assert/strict"
import { after, before, test } from "node:test"
import { PrismaClient } from "@prisma/client"
import getSearch from "../src/app/searches/queries/getSearch"
import { revokeOtherAccess, upsertLinkedInUser } from "../src/server/auth/accounts"
import { linkRequestValue } from "../src/server/auth/link-request"
import {
  assertLoginRateLimit,
  consumeMagicLink,
  issueMagicLink,
  LOGIN_EMAIL_LIMIT,
  MAGIC_LINK_EMAIL_LIMIT,
  maskEmail,
  peekMagicLink,
} from "../src/server/auth/magic-link"
import { signInWithMagicLink } from "../src/server/auth/sign-in-link"

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
  await db.auditEvent.deleteMany({ where: { action: { contains: `auth-${stamp}` } } })
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

test("the verify page can show a link's account without using the link up", async () => {
  const email = `peek-auth-${stamp}@example.com`
  const token = await issueMagicLink(email, `ip-peek-auth-${stamp}`)
  assert.equal(await peekMagicLink(token), email)
  assert.equal(await peekMagicLink(token), email)
  assert.equal(await consumeMagicLink(token), email)
  assert.equal(await peekMagicLink(token), null)
  assert.equal(maskEmail("jolanta@example.com"), "jo•••@example.com")
  assert.equal(maskEmail("ab@example.com"), "a•••@example.com")
})

async function guestWithData(label: string) {
  const guest = await db.user.create({
    data: { email: `guest-${label}-auth-${stamp}@guest.example`, role: "GUEST", name: "Guest" },
  })
  await db.auditEvent.create({ data: { userId: guest.id, action: `guest-${label}-auth-${stamp}` } })
  return guest
}

test("a sign-in link moves guest data only into the browser that asked for it", async () => {
  const email = `claim-auth-${stamp}@example.com`
  const account = await db.user.create({ data: { email, role: "USER" } })

  // Someone sends you a link to their own account: your guest data stays yours.
  const victim = await guestWithData("victim")
  const sent = await issueMagicLink(email, `ip-claim1-auth-${stamp}`)
  const first = await signInWithMagicLink({
    token: sent,
    sessionUserId: victim.id,
    linkRequestCookie: null,
  })
  assert.equal(first?.user.id, account.id)
  assert.equal(first?.claimedGuest, false)
  assert.ok(await db.user.findUnique({ where: { id: victim.id } }))
  assert.equal(await db.auditEvent.count({ where: { userId: account.id } }), 0)
  assert.ok((await db.user.findUnique({ where: { id: account.id } }))?.emailVerifiedAt)

  // A cookie set for another address does not count either.
  const other = await issueMagicLink(email, `ip-claim2-auth-${stamp}`)
  const second = await signInWithMagicLink({
    token: other,
    sessionUserId: victim.id,
    linkRequestCookie: linkRequestValue(`someone-else-auth-${stamp}@example.com`),
  })
  assert.equal(second?.claimedGuest, false)

  // You asked for your own link in this browser: your guest data comes along.
  const own = await issueMagicLink(email, `ip-claim3-auth-${stamp}`)
  const third = await signInWithMagicLink({
    token: own,
    sessionUserId: victim.id,
    linkRequestCookie: linkRequestValue(email),
  })
  assert.equal(third?.claimedGuest, true)
  assert.equal(await db.user.findUnique({ where: { id: victim.id } }), null)
  assert.equal(
    await db.auditEvent.count({
      where: { userId: account.id, action: `guest-victim-auth-${stamp}` },
    }),
    1
  )

  assert.equal(
    await signInWithMagicLink({ token: own, sessionUserId: null, linkRequestCookie: null }),
    null
  )
})

test("password sign-in stops after the per-email limit", async () => {
  const email = `guess-auth-${stamp}@example.com`
  for (let i = 0; i < LOGIN_EMAIL_LIMIT; i += 1) {
    await assertLoginRateLimit(email, `ip-guess-${i}-auth-${stamp}`)
  }
  await assert.rejects(() => assertLoginRateLimit(email, `ip-guess-last-auth-${stamp}`))
  await assertLoginRateLimit(`other-guess-auth-${stamp}@example.com`, `ip-guess-x-auth-${stamp}`)
})

test("setting a password ends other sessions and every extension token", async () => {
  const user = await db.user.create({
    data: { email: `pw-auth-${stamp}@example.com`, role: "USER" },
  })
  const other = await db.user.create({
    data: { email: `pw-other-auth-${stamp}@example.com`, role: "USER" },
  })
  for (const [userId, handle] of [
    [user.id, `keep-auth-${stamp}`],
    [user.id, `old-auth-${stamp}`],
    [other.id, `others-auth-${stamp}`],
  ] as const) {
    await db.session.create({ data: { userId, handle } })
  }
  for (const [userId, name] of [
    [user.id, "mine"],
    [other.id, "theirs"],
  ] as const) {
    await db.apiToken.create({
      data: { userId, name, hashedToken: `hash-${name}-auth-${stamp}`, prefix: "nr_test" },
    })
  }

  const revoked = await revokeOtherAccess(user.id, `keep-auth-${stamp}`)
  assert.deepEqual(revoked, { sessions: 1, tokens: 1 })
  const handles = await db.session.findMany({
    where: { userId: { in: [user.id, other.id] } },
    select: { handle: true },
    orderBy: { handle: "asc" },
  })
  assert.deepEqual(
    handles.map((row) => row.handle),
    [`keep-auth-${stamp}`, `others-auth-${stamp}`]
  )
  const tokens = await db.apiToken.findMany({
    where: { userId: { in: [user.id, other.id] } },
    select: { name: true, revokedAt: true },
  })
  assert.ok(tokens.find((row) => row.name === "mine")?.revokedAt)
  assert.equal(tokens.find((row) => row.name === "theirs")?.revokedAt, null)
})

test("LinkedIn links an existing account only when it verified the email", async () => {
  const email = `link-auth-${stamp}@example.com`
  const existing = await db.user.create({ data: { email, role: "USER" } })
  const identity = { sub: `sub-${stamp}`, email, name: null, picture: null }

  assert.equal(await upsertLinkedInUser({ ...identity, emailVerified: false }), null)
  const untouched = await db.user.findUniqueOrThrow({ where: { id: existing.id } })
  assert.equal(untouched.linkedinSub, null)

  const linked = await upsertLinkedInUser({ ...identity, emailVerified: true })
  assert.equal(linked?.id, existing.id)
  assert.equal(linked?.linkedinSub, identity.sub)
})

test("a new LinkedIn account with an unverified email stays unverified", async () => {
  const email = `new-auth-${stamp}@example.com`
  const created = await upsertLinkedInUser({
    sub: `new-sub-${stamp}`,
    email,
    emailVerified: false,
    name: null,
    picture: null,
  })
  assert.equal(created?.email, email)
  assert.equal(created?.emailVerifiedAt, null)
})

test("a LinkedIn sign-in does not take an email another account holds", async () => {
  const held = `held-auth-${stamp}@example.com`
  await db.user.create({ data: { email: held, role: "USER" } })
  const mine = await db.user.create({
    data: { email: `mine-auth-${stamp}@example.com`, role: "USER", linkedinSub: `mine-${stamp}` },
  })
  const signedIn = await upsertLinkedInUser({
    sub: `mine-${stamp}`,
    email: held,
    emailVerified: true,
    name: null,
    picture: null,
  })
  assert.equal(signedIn?.id, mine.id)
  assert.equal(signedIn?.email, mine.email)
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
