import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { appOrigin } from "src/server/auth/email"
import { linkedInAuthorizeUrl } from "src/server/auth/linkedin"
import { safeReturnTo } from "src/shared/return-to"

const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
}

export async function GET(request: Request) {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  const returnTo = safeReturnTo(new URL(request.url).searchParams.get("returnTo"))
  if (!clientId) {
    const login = new URL("/login?error=linkedin-config", appOrigin())
    if (returnTo) login.searchParams.set("returnTo", returnTo)
    return NextResponse.redirect(login)
  }
  const state = randomBytes(16).toString("hex")
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI?.trim() || `${appOrigin()}/api/auth/linkedin/callback`
  const destination = linkedInAuthorizeUrl({ clientId, redirectUri, state })
  const response = NextResponse.redirect(destination)
  response.cookies.set("linkedin_oauth_state", state, cookie)
  if (returnTo) response.cookies.set("linkedin_oauth_return", returnTo, cookie)
  else response.cookies.delete("linkedin_oauth_return")
  return response
}
