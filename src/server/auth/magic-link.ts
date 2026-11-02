import { createHash, randomBytes } from "crypto"
import db from "db"

export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000
export const MAGIC_LINK_EMAIL_LIMIT = 5
export const MAGIC_LINK_IP_LIMIT = 20
export const MAGIC_LINK_WINDOW_MS = 60 * 60 * 1000

export class AuthRateLimitError extends Error {
  readonly scope: "email" | "ip"

  constructor(scope: "email" | "ip") {
    super(scope === "email" ? "Too many links for this email" : "Too many links from this network")
    this.name = "AuthRateLimitError"
    this.scope = scope
  }
}

export function hashLoginToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function newLoginToken(): string {
  return randomBytes(32).toString("base64url")
}

export async function takeSlot(key: string, limit: number, now: Date): Promise<boolean> {
  const windowStart = new Date(now.getTime() - MAGIC_LINK_WINDOW_MS)
  const existing = await db.authRateLimit.findUnique({ where: { key } })
  if (!existing || existing.windowStart < windowStart) {
    await db.authRateLimit.upsert({
      where: { key },
      update: { windowStart: now, count: 1 },
      create: { key, windowStart: now, count: 1 },
    })
    return true
  }
  if (existing.count >= limit) return false
  await db.authRateLimit.update({ where: { key }, data: { count: { increment: 1 } } })
  return true
}

export async function assertSearchRateLimit(userId: number, now = new Date()) {
  const ok = await takeSlot(`search:${userId}`, 20, now)
  if (!ok) throw new Error("Too many searches. Wait an hour and try again.")
}

/** Reading a pasted link fetches a page and may call the model, so it is capped per person. */
export async function assertOfferReadLimit(userId: number, now = new Date()) {
  const ok = await takeSlot(`offer-read:${userId}`, 60, now)
  if (!ok) throw new Error("Too many links read. Wait an hour and try again.")
}

export async function assertMagicLinkRateLimit(email: string, ip: string, now = new Date()) {
  const emailOk = await takeSlot(`email:${email}`, MAGIC_LINK_EMAIL_LIMIT, now)
  if (!emailOk) throw new AuthRateLimitError("email")
  const ipOk = await takeSlot(`ip:${ip}`, MAGIC_LINK_IP_LIMIT, now)
  if (!ipOk) throw new AuthRateLimitError("ip")
}

export async function issueMagicLink(email: string, ip: string, now = new Date()) {
  await assertMagicLinkRateLimit(email, ip, now)
  const token = newLoginToken()
  await db.loginLink.create({
    data: {
      email,
      hashedToken: hashLoginToken(token),
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
      requestIp: ip,
    },
  })
  return token
}

/** Returns the email when the token is unused and unexpired. A second call returns null. */
export async function consumeMagicLink(token: string, now = new Date()): Promise<string | null> {
  const hashedToken = hashLoginToken(token)
  const row = await db.loginLink.findUnique({ where: { hashedToken } })
  if (!row || row.usedAt || row.expiresAt <= now) return null
  const updated = await db.loginLink.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  })
  if (updated.count !== 1) return null
  return row.email
}

/** The email a token would sign in, without using it up. The page shows it before the click. */
export async function peekMagicLink(token: string, now = new Date()): Promise<string | null> {
  const row = await db.loginLink.findUnique({ where: { hashedToken: hashLoginToken(token) } })
  if (!row || row.usedAt || row.expiresAt <= now) return null
  return row.email
}

/** "jo•••@example.com": enough to recognise your own address, not to harvest someone else's. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 1) return "•••"
  const local = email.slice(0, at)
  const shown = local.length > 4 ? local.slice(0, 2) : local.slice(0, 1)
  return `${shown}•••${email.slice(at)}`
}

export const LOGIN_EMAIL_LIMIT = 10
export const LOGIN_IP_LIMIT = 50

/** Password guesses per account and per address, in the same hourly window as magic links. */
export async function assertLoginRateLimit(email: string, ip: string, now = new Date()) {
  const ipOk = await takeSlot(`login-ip:${ip}`, LOGIN_IP_LIMIT, now)
  if (!ipOk) throw new AuthRateLimitError("ip")
  const emailOk = await takeSlot(`login:${email}`, LOGIN_EMAIL_LIMIT, now)
  if (!emailOk) throw new AuthRateLimitError("email")
}
