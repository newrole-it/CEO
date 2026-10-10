export const LINKEDIN_SCOPES = ["openid", "profile", "email"] as const

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
  if (!tokenResponse.ok) return null
  const tokenPayload = (await tokenResponse.json()) as { access_token?: string }
  if (!tokenPayload.access_token) return null
  const profileResponse = await fetchImpl(LINKEDIN_USERINFO, {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  })
  if (!profileResponse.ok) return null
  return parseLinkedInUserInfo(await profileResponse.json())
}
