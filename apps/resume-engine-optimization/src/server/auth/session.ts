import { createHash, randomBytes } from "crypto"
import { cookies, headers } from "next/headers"
import db from "db"

/**
 * The signed-in session, kept in the Session table and named by an httpOnly cookie.
 *
 * The cookie and the row have the shape @blitzjs/auth 3.0.2 gave them, so sessions made before
 * Blitz was removed stay valid: the cookie holds base64("<handle>;<id>;<sha256 of publicData>;v0"),
 * the row holds the sha256 of the cookie and publicData as JSON ({ userId, role }).
 */

export const SESSION_COOKIE = "jobscanner_sSessionToken"
/** Cookies Blitz also set. Nothing reads them now; they are cleared when a session starts or ends. */
const STALE_COOKIES = [
  "jobscanner_sAnonymousSessionToken",
  "jobscanner_sAntiCsrfToken",
  "jobscanner_sPublicDataToken",
]
const SESSION_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const TOKEN_VERSION = "v0"

export type PublicData = { userId: number; role: string }

export function hash256(input: string): string {
  return createHash("sha256").update(input).digest("hex")
}

/** 32 URL-safe characters, as nanoid made them for Blitz. */
function randomToken(): string {
  return randomBytes(24).toString("base64url")
}

export function createSessionToken(handle: string, publicData: string): string {
  const parts = [handle, randomToken(), hash256(publicData), TOKEN_VERSION]
  return Buffer.from(parts.join(";")).toString("base64")
}

export function parseSessionToken(token: string): { handle: string; version: string } | null {
  const [handle, id, hashedPublicData, version] = Buffer.from(token, "base64").toString().split(";")
  if (!handle || !id || !hashedPublicData || !version) return null
  return { handle, version }
}

function parsePublicData(json: string | null): PublicData | null {
  if (!json) return null
  try {
    const data = JSON.parse(json) as Partial<PublicData>
    return typeof data.userId === "number"
      ? { userId: data.userId, role: String(data.role ?? "") }
      : null
  } catch {
    return null
  }
}

type Persisted = { handle: string; publicData: PublicData; expiresAt: Date | null }

/** The session the cookie names, when its row exists, matches it and has not expired. */
export async function readSession(
  token: string | undefined,
  now = new Date()
): Promise<Persisted | null> {
  if (!token) return null
  const parsed = parseSessionToken(token)
  if (!parsed || parsed.version !== TOKEN_VERSION) return null
  const row = await db.session.findUnique({ where: { handle: parsed.handle } })
  if (!row || row.hashedSessionToken !== hash256(token)) return null
  if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null
  const publicData = parsePublicData(row.publicData)
  return publicData ? { handle: row.handle, publicData, expiresAt: row.expiresAt } : null
}

/** Blitz's rule: Secure in production, except for a request to the host name localhost. */
async function cookieOptions(expires: Date) {
  const host = ((await headers()).get("host") ?? "").split(":")[0]
  return {
    path: "/",
    httpOnly: true,
    sameSite: "lax" as const,
    secure:
      !process.env.DISABLE_SECURE_COOKIES &&
      process.env.NODE_ENV === "production" &&
      host !== "localhost",
    expires,
  }
}

/** Starts a session for the user: a new row and a new cookie. */
export async function startSession(data: PublicData, now = new Date()): Promise<string> {
  const handle = `${randomToken()}:ots`
  const publicData = JSON.stringify(data)
  const token = createSessionToken(handle, publicData)
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS)
  await db.session.create({
    data: {
      handle,
      userId: data.userId,
      expiresAt,
      hashedSessionToken: hash256(token),
      antiCSRFToken: randomToken(),
      publicData,
      privateData: "{}",
    },
  })
  const jar = await cookies()
  jar.set(SESSION_COOKIE, token, await cookieOptions(expiresAt))
  for (const name of STALE_COOKIES) jar.delete(name)
  return handle
}

/** Ends the session the cookie names, row and cookie. */
export async function endSession(handle: string | null): Promise<void> {
  if (handle) await db.session.deleteMany({ where: { handle } })
  const jar = await cookies()
  jar.delete(SESSION_COOKIE)
  for (const name of STALE_COOKIES) jar.delete(name)
}

/** Once a quarter of the 30 days has passed, a request that may write cookies extends the session. */
export async function extendSession(session: Persisted, token: string, now = new Date()) {
  const left = session.expiresAt ? session.expiresAt.getTime() - now.getTime() : Infinity
  if (left >= 0.75 * SESSION_DAYS * DAY_MS) return
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * DAY_MS)
  await db.session.update({ where: { handle: session.handle }, data: { expiresAt } })
  ;(await cookies()).set(SESSION_COOKIE, token, await cookieOptions(expiresAt))
}

/** What resolvers and route handlers read and change: the same names Blitz's ctx.session had. */
export class SessionContext {
  constructor(
    private persisted: Persisted | null,
    private readonly token: string | undefined
  ) {}

  get userId(): number | null {
    return this.persisted?.publicData.userId ?? null
  }

  get role(): string | null {
    return this.persisted?.publicData.role ?? null
  }

  get $handle(): string | null {
    return this.persisted?.handle ?? null
  }

  get $publicData(): Partial<PublicData> {
    return this.persisted?.publicData ?? {}
  }

  /** Replaces the current session, if any, with a new one for this user. */
  async $create(data: PublicData): Promise<void> {
    const previous = this.persisted?.handle ?? null
    const handle = await startSession(data)
    if (previous) await db.session.deleteMany({ where: { handle: previous } })
    this.persisted = { handle, publicData: data, expiresAt: null }
  }

  async $revoke(): Promise<void> {
    await endSession(this.persisted?.handle ?? null)
    this.persisted = null
  }

  /** Only where cookies may be written: Server Actions and route handlers. */
  async $extend(): Promise<void> {
    if (this.persisted && this.token) await extendSession(this.persisted, this.token)
  }
}

/** The session of the current request. Reads the cookie; writes nothing until asked to. */
export async function getSession(): Promise<SessionContext> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  return new SessionContext(await readSession(token), token)
}
