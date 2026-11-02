import { createHash, timingSafeEqual } from "crypto"
import { appOrigin } from "src/server/auth/email"
import { MAGIC_LINK_TTL_MS } from "src/server/auth/magic-link"

/**
 * Marks the browser that asked for a sign-in link. Only that browser hands its guest data to the
 * account: a link someone else requested and sent you must not move your CVs onto their account.
 */

// The old project name stays: a renamed cookie would orphan link requests already sent.
export const LINK_REQUEST_COOKIE = "nowarola_link_request"

export function linkRequestValue(email: string): string {
  return createHash("sha256").update(`link-request:${email.toLowerCase()}`).digest("hex")
}

/** True when the cookie this browser holds was set for this email. */
export function linkRequestedHere(cookieValue: string | null | undefined, email: string): boolean {
  if (!cookieValue) return false
  const expected = new TextEncoder().encode(linkRequestValue(email))
  const actual = new TextEncoder().encode(cookieValue)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function linkRequestCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: appOrigin().startsWith("https:"),
    path: "/",
    maxAge: Math.round(MAGIC_LINK_TTL_MS / 1000),
  }
}

/** Imported on call, like next/headers elsewhere in resolvers: client code imports those files. */
async function cookieStore() {
  const { cookies } = await import("next/headers")
  return cookies()
}

export async function rememberLinkRequest(email: string): Promise<void> {
  const store = await cookieStore()
  store.set(LINK_REQUEST_COOKIE, linkRequestValue(email), linkRequestCookieOptions())
}

/** Reads and clears the mark, so it works for one sign-in only. */
export async function takeLinkRequest(): Promise<string | null> {
  const store = await cookieStore()
  const value = store.get(LINK_REQUEST_COOKIE)?.value ?? null
  if (value) store.delete(LINK_REQUEST_COOKIE)
  return value
}
