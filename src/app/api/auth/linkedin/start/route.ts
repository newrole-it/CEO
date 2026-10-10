import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { appOrigin } from "src/server/auth/email"
import { linkedInAuthorizeUrl } from "src/server/auth/linkedin"

export async function GET() {
  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  if (!clientId) {
    return NextResponse.redirect(new URL("/login?error=linkedin-config", appOrigin()))
  }
  const state = randomBytes(16).toString("hex")
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI?.trim() || `${appOrigin()}/api/auth/linkedin/callback`
  const destination = linkedInAuthorizeUrl({ clientId, redirectUri, state })
  const response = NextResponse.redirect(destination)
  response.cookies.set("linkedin_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  })
  return response
}
