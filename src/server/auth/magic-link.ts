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

async function takeSlot(key: string, limit: number, now: Date): Promise<boolean> {
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
