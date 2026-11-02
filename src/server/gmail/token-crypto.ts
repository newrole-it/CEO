import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto"

/**
 * The refresh token is the key to a whole mailbox, so a copy of the database must not be enough
 * to use it. AES-256-GCM with a key from GMAIL_TOKEN_KEY, else from SESSION_SECRET_KEY. The user
 * id is authenticated too, so a sealed token copied onto another account does not open.
 */

const VERSION = "v1"
const MIN_SECRET = 32

type Env = Record<string, string | undefined>

function tokenKey(env: Env): Uint8Array | null {
  const secret = env.GMAIL_TOKEN_KEY?.trim() || env.SESSION_SECRET_KEY?.trim()
  // The placeholder from .env.example is long enough and public, so it protects nothing.
  if (!secret || secret.length < MIN_SECRET || /^replace-with/i.test(secret)) return null
  // The salt keeps the project's old name: changing it would make every stored token undecryptable.
  return new Uint8Array(hkdfSync("sha256", secret, "nowarola", "gmail-refresh-token", 32))
}

/** Whether a token could be stored at all. Checked before sending anyone to Google. */
export function tokenKeyReady(env: Env = process.env): boolean {
  return tokenKey(env) != null
}

const boundTo = (userId: number) => new TextEncoder().encode(`gmail:${userId}`)
const fromHex = (value: string) => new Uint8Array(Buffer.from(value, "hex"))

/** Null when no usable secret is set; the caller refuses to store the token in the clear. */
export function sealToken(token: string, userId: number, env: Env = process.env): string | null {
  const key = tokenKey(env)
  if (!key) return null
  const iv = randomBytes(12).toString("hex")
  const cipher = createCipheriv("aes-256-gcm", key, fromHex(iv))
  cipher.setAAD(boundTo(userId))
  const body = cipher.update(token, "utf8", "hex") + cipher.final("hex")
  return [VERSION, iv, cipher.getAuthTag().toString("hex"), body].join(".")
}

/** Null when the secret changed or the value was tampered with: the person connects again. */
export function openToken(sealed: string, userId: number, env: Env = process.env): string | null {
  const key = tokenKey(env)
  const [version, iv, tag, body] = sealed.split(".")
  if (!key || version !== VERSION || !iv || !tag || !body) return null
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, fromHex(iv))
    decipher.setAAD(boundTo(userId))
    decipher.setAuthTag(fromHex(tag))
    return decipher.update(body, "hex", "utf8") + decipher.final("utf8")
  } catch {
    return null
  }
}
