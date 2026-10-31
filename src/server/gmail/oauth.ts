import { createHash, randomBytes } from "crypto"
import { tokenKeyReady } from "./token-crypto"

/**
 * The only scope asked for. Google has nothing narrower that can read a message body: no scope
 * is limited to a label or a search, and gmail.metadata has no body and cannot use `q`. The limit
 * to job mail is therefore ours to enforce: see allowlist.ts, gate.ts and reader.ts.
 */
export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"

export const GOOGLE_AUTHORIZE = "https://accounts.google.com/o/oauth2/v2/auth"
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token"
export const GOOGLE_REVOKE = "https://oauth2.googleapis.com/revoke"
export const GOOGLE_CONSOLE = "https://console.cloud.google.com/apis/credentials"

const TIMEOUT_MS = 15_000

/** Both values are required. An id without a secret still cannot finish the connection. */
export function gmailCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GMAIL_CLIENT_ID?.trim()
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** The callback Google must have on its allow list. It has to match byte for byte. */
export function gmailRedirectUri(origin: string): string {
  return process.env.GMAIL_REDIRECT_URI?.trim() || `${origin}/api/auth/gmail/callback`
}

/** What the settings helper shows when the keys are missing. Never includes the secret. */
export function gmailSetup(origin: string) {
  return {
    configured: gmailCredentials() != null,
    keyReady: tokenKeyReady(),
    redirectUri: gmailRedirectUri(origin),
    consoleUrl: GOOGLE_CONSOLE,
    scope: GMAIL_SCOPE,
    envKeys: ["GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET"],
  }
}

export function newPkceVerifier(): string {
  return randomBytes(48).toString("base64url")
}

export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}

export function gmailAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge: string
}): string {
  const url = new URL(GOOGLE_AUTHORIZE)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", args.clientId)
  url.searchParams.set("redirect_uri", args.redirectUri)
  url.searchParams.set("scope", GMAIL_SCOPE)
  url.searchParams.set("state", args.state)
  url.searchParams.set("code_challenge", args.codeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  // A refresh token for the worker. consent makes Google issue one on every connection, and
  // leaving out include_granted_scopes keeps earlier grants of this client out of the token.
  url.searchParams.set("access_type", "offline")
  url.searchParams.set("prompt", "consent")
  return url.toString()
}

/** Exactly the read-only scope, or a reason to refuse the grant. A broader token is never kept. */
export function grantProblem(scope: string | null | undefined): "missing" | "broader" | null {
  const granted = (scope ?? "").split(/\s+/).filter(Boolean)
  if (!granted.includes(GMAIL_SCOPE)) return "missing"
  return granted.length === 1 ? null : "broader"
}

export function gmailCallbackError(params: URLSearchParams): string | null {
  const error = params.get("error")
  if (!error) return null
  return error === "access_denied" ? "cancelled" : "denied"
}

export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

type TokenPayload = {
  access_token?: unknown
  refresh_token?: unknown
  scope?: unknown
  error?: unknown
}

async function postForm(
  url: string,
  body: URLSearchParams,
  fetchImpl: FetchLike
): Promise<{ status: number; ok: boolean; payload: TokenPayload } | null> {
  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const payload = (await response.json().catch(() => ({}))) as TokenPayload
    return { status: response.status, ok: response.ok, payload: payload ?? {} }
  } catch {
    return null
  }
}

export type GmailGrant = { accessToken: string; refreshToken: string | null; scope: string }

export async function exchangeGmailCode(
  args: {
    code: string
    codeVerifier: string
    clientId: string
    clientSecret: string
    redirectUri: string
  },
  fetchImpl: FetchLike
): Promise<GmailGrant | null> {
  const reply = await postForm(
    GOOGLE_TOKEN,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      code_verifier: args.codeVerifier,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      client_secret: args.clientSecret,
    }),
    fetchImpl
  )
  if (!reply?.ok) {
    // A 400 here is almost always a redirect URI that is not on the client's allow list.
    console.warn(`[gmail] token exchange failed with HTTP ${reply?.status ?? "no response"}`)
    return null
  }
  const { access_token: accessToken, refresh_token: refreshToken, scope } = reply.payload
  if (typeof accessToken !== "string" || !accessToken) return null
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" && refreshToken ? refreshToken : null,
    scope: typeof scope === "string" ? scope : "",
  }
}

/**
 * A short-lived access token for one sync; it is never stored. invalid_grant means the person
 * revoked access, or the Google project is still in "Testing" and its 7 days are up.
 */
export async function refreshAccessToken(
  args: { refreshToken: string; clientId: string; clientSecret: string },
  fetchImpl: FetchLike
): Promise<{ accessToken: string } | { error: "reconnect" | "network" | "http" }> {
  const reply = await postForm(
    GOOGLE_TOKEN,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      client_id: args.clientId,
      client_secret: args.clientSecret,
    }),
    fetchImpl
  )
  if (!reply) return { error: "network" }
  if (!reply.ok) return { error: reply.payload.error === "invalid_grant" ? "reconnect" : "http" }
  const { access_token: accessToken, scope } = reply.payload
  if (typeof accessToken !== "string" || !accessToken) return { error: "http" }
  // Google omits scope on some refreshes. When it is there it must still be the read-only one.
  if (typeof scope === "string" && grantProblem(scope)) return { error: "reconnect" }
  return { accessToken }
}

/** Revokes the grant at Google. A token that is already invalid answers 400, which is just as good. */
export async function revokeGoogleToken(token: string, fetchImpl: FetchLike): Promise<boolean> {
  const reply = await postForm(GOOGLE_REVOKE, new URLSearchParams({ token }), fetchImpl)
  if (!reply) return false
  return reply.ok || reply.payload.error === "invalid_token"
}
