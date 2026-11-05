import { createHash, randomBytes } from "crypto"
import db from "db"

/**
 * Bearer tokens for the Chrome extension (docs/product/plan-aplikacje.md §5.5).
 * Only the sha256 is stored; the token itself is shown once. Revoking works at once.
 */

export const TOKEN_PREFIX = "nr_"
/** How many leading characters settings show ("nr_AbC1234") */
export const PREFIX_LENGTH = 10
/** lastUsedAt is written at most this often */
export const LAST_USED_EVERY_MS = 60_000
/** nr_ + 43 base64url characters; a little slack, never anything else. */
const TOKEN_SHAPE = new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{20,100}$`)

export type ApiTokenView = {
  id: string
  name: string
  prefix: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

export function generateApiToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export function tokenPrefix(token: string): string {
  return token.slice(0, PREFIX_LENGTH)
}

/** The token from `Authorization: Bearer nr_…`, or null when the header is missing or malformed. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^\s*Bearer\s+(\S+)\s*$/i.exec(header ?? "")
  if (!match) return null
  const token = match[1]
  return TOKEN_SHAPE.test(token) ? token : null
}

export function shouldTouch(lastUsedAt: Date | null, now: Date): boolean {
  return !lastUsedAt || now.getTime() - lastUsedAt.getTime() >= LAST_USED_EVERY_MS
}

const viewSelect = {
  id: true,
  name: true,
  prefix: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const

function cleanName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 80)
  return clean || "Chrome"
}

export async function createApiToken(
  userId: number,
  name: string
): Promise<{ token: string; view: ApiTokenView }> {
  const token = generateApiToken()
  const view = await db.apiToken.create({
    data: {
      userId,
      name: cleanName(name),
      hashedToken: hashApiToken(token),
      prefix: tokenPrefix(token),
    },
    select: viewSelect,
  })
  return { token, view }
}

/** Active tokens first, newest first. Hashes never leave the server. */
export async function listApiTokens(userId: number): Promise<ApiTokenView[]> {
  const rows = await db.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: viewSelect,
  })
  return [...rows.filter((row) => !row.revokedAt), ...rows.filter((row) => row.revokedAt)]
}

/** True when a token of this person was revoked now; false when it was missing or already revoked. */
export async function revokeApiToken(userId: number, id: string): Promise<boolean> {
  const result = await db.apiToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  return result.count > 0
}

/**
 * The person behind a request's Bearer token. Null for a missing, unknown or revoked token,
 * a deleted account and a guest account (guests cannot pair the extension).
 */
export async function authenticateRequest(
  request: Request
): Promise<{ userId: number; tokenId: string } | null> {
  const token = bearerToken(request.headers.get("authorization"))
  if (!token) return null
  const row = await db.apiToken.findUnique({
    where: { hashedToken: hashApiToken(token) },
    select: {
      id: true,
      userId: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { role: true, deletedAt: true } },
    },
  })
  if (!row || row.revokedAt) return null
  if (!row.user || row.user.deletedAt || row.user.role === "GUEST") return null
  const now = new Date()
  if (shouldTouch(row.lastUsedAt, now)) {
    await db.apiToken
      .update({ where: { id: row.id }, data: { lastUsedAt: now } })
      .catch(() => undefined)
  }
  return { userId: row.userId, tokenId: row.id }
}
