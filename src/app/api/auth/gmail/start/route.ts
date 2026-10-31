import { randomBytes } from "crypto"
import { NextResponse } from "next/server"
import db from "db"
import { getBlitzContext } from "src/app/blitz-server"
import { appOrigin } from "src/server/auth/email"
import {
  gmailAuthorizeUrl,
  gmailCredentials,
  gmailRedirectUri,
  newPkceVerifier,
  pkceChallenge,
} from "src/server/gmail/oauth"
import { tokenKeyReady } from "src/server/gmail/token-crypto"

const COOKIE_PATH = "/api/auth/gmail"

export async function GET(request: Request) {
  const requested = new URL(request.url)
  const origin = appOrigin()
  // The cookies must live on the host Google returns to. The Host header, not request.url: under
  // `next dev -H` that one says localhost whatever was opened, and this would redirect to itself.
  const host = request.headers.get("host")
  if (host && host !== new URL(origin).host) {
    return NextResponse.redirect(new URL(requested.pathname, origin))
  }
  const settings = (result: string) =>
    NextResponse.redirect(new URL(`/settings?gmail=${result}#st-gmail`, origin))

  // A mailbox belongs to a real account: a guest's session is one cleared cookie from being lost.
  const ctx = await getBlitzContext()
  const userId = ctx.session.userId
  if (!userId) return NextResponse.redirect(new URL("/login?returnTo=/settings", origin))
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || user.role === "GUEST") {
    return NextResponse.redirect(new URL("/login?returnTo=/settings", origin))
  }

  const credentials = gmailCredentials()
  if (!credentials) return settings("config")
  // Before Google asks for consent: a grant that could only be stored in the open is not wanted.
  if (!tokenKeyReady()) return settings("key")

  const state = randomBytes(24).toString("hex")
  const verifier = newPkceVerifier()
  const response = NextResponse.redirect(
    gmailAuthorizeUrl({
      clientId: credentials.clientId,
      redirectUri: gmailRedirectUri(origin),
      state,
      codeChallenge: pkceChallenge(verifier),
    })
  )
  const cookie = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: origin.startsWith("https:"),
    path: COOKIE_PATH,
    maxAge: 600,
  }
  // Bound to the account, so the grant cannot land on whoever is signed in when Google returns.
  response.cookies.set("gmail_oauth_state", `${userId}.${state}`, cookie)
  response.cookies.set("gmail_oauth_verifier", verifier, cookie)
  return response
}
