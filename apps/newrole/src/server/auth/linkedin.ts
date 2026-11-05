export const LINKEDIN_SCOPES = ["openid", "profile", "email"] as const

/** Both values are required. An id without a secret still cannot finish sign-in. */
export function linkedInCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export const LINKEDIN_DEVELOPER_APPS = "https://www.linkedin.com/developers/apps"

/** The callback LinkedIn must have on its allow list. It has to match byte for byte. */
export function linkedInRedirectUri(origin: string): string {
  return process.env.LINKEDIN_REDIRECT_URI?.trim() || `${origin}/api/auth/linkedin/callback`
}

/** What the setup helper shows when the keys are missing. Never includes the secret. */
export function linkedInSetup(origin: string): {
  configured: boolean
  redirectUri: string
  developerUrl: string
  envKeys: readonly string[]
} {
  return {
    configured: linkedInCredentials() != null,
    redirectUri: linkedInRedirectUri(origin),
    developerUrl: LINKEDIN_DEVELOPER_APPS,
    envKeys: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  }
}

/** Login error code for a callback. LinkedIn sends error=user_cancelled_login when consent is declined. */
export function linkedInCallbackError(params: URLSearchParams): string | null {
  const error = params.get("error")
  if (!error) return null
  return error === "user_cancelled_login" || error === "user_cancelled_authorize"
    ? "linkedin-cancelled"
    : "linkedin-denied"
}

export const LINKEDIN_AUTHORIZE = "https://www.linkedin.com/oauth/v2/authorization"
export const LINKEDIN_TOKEN = "https://www.linkedin.com/oauth/v2/accessToken"
export const LINKEDIN_USERINFO = "https://api.linkedin.com/v2/userinfo"

export type LinkedInIdentity = {
  sub: string
  email: string
  emailVerified: boolean
  name: string | null
  picture: string | null
}

export function linkedInAuthorizeUrl(args: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const url = new URL(LINKEDIN_AUTHORIZE)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", args.clientId)
  url.searchParams.set("redirect_uri", args.redirectUri)
  url.searchParams.set("state", args.state)
  url.searchParams.set("scope", LINKEDIN_SCOPES.join(" "))
  return url.toString()
}

export function parseLinkedInUserInfo(payload: unknown): LinkedInIdentity | null {
  if (!payload || typeof payload !== "object") return null
  const record = payload as Record<string, unknown>
  const sub = typeof record.sub === "string" ? record.sub.trim() : ""
  const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : ""
  if (!sub || !email) return null
  const name = typeof record.name === "string" ? record.name.trim() : ""
  const picture = typeof record.picture === "string" ? record.picture.trim() : ""
  return {
    sub,
    email,
    emailVerified: record.email_verified === true,
    name: name || null,
    picture: picture.startsWith("https://") ? picture : null,
  }
}

type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

export async function exchangeLinkedInCode(
  args: {
    code: string
    clientId: string
    clientSecret: string
    redirectUri: string
  },
  fetchImpl: FetchLike
): Promise<LinkedInIdentity | null> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    client_secret: args.clientSecret,
  })
  const tokenResponse = await fetchImpl(LINKEDIN_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!tokenResponse.ok) {
    // A 400 here is almost always a redirect URI that is not on the app's allow list.
    console.warn(`[linkedin] token exchange failed with HTTP ${tokenResponse.status}`)
    return null
  }
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenPayload.access_token) return null
  const profileResponse = await fetchImpl(LINKEDIN_USERINFO, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  })
  if (!profileResponse.ok) {
    console.warn(`[linkedin] userinfo failed with HTTP ${profileResponse.status}`)
    return null
  }
  return parseLinkedInUserInfo(await profileResponse.json())
}
