import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import { appOrigin } from "src/server/auth/email"
import {
  linkedInAuthorizeUrl,
  linkedInCredentials,
  linkedInRedirectUri,
} from "src/server/auth/linkedin"
import { safeReturnTo } from "src/shared/return-to"

const cookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 600,
}

export async function GET(request: Request) {
  const requested = new URL(request.url)
  const origin = appOrigin()
  // The state cookie must live on the host LinkedIn returns to. Opening the app on
  // localhost while APP_ORIGIN says 127.0.0.1 would otherwise always fail the state check.
  if (requested.host !== new URL(origin).host) {
    return NextResponse.redirect(new URL(requested.pathname + requested.search, origin))
  }
  const credentials = linkedInCredentials()
  const returnTo = safeReturnTo(requested.searchParams.get("returnTo"))
  if (!credentials) {
    const login = new URL("/login?error=linkedin-config", origin)
    if (returnTo) login.searchParams.set("returnTo", returnTo)
    return NextResponse.redirect(login)
  }
  const state = randomBytes(16).toString("hex")
  const redirectUri = linkedInRedirectUri(origin)
  const destination = linkedInAuthorizeUrl({ clientId: credentials.clientId, redirectUri, state })
  const response = NextResponse.redirect(destination)
  response.cookies.set("linkedin_oauth_state", state, cookie)
  if (returnTo) response.cookies.set("linkedin_oauth_return", returnTo, cookie)
  else response.cookies.delete("linkedin_oauth_return")
  return response
}
