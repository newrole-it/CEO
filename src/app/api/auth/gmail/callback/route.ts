import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import db from "db"
import { getBlitzContext } from "src/app/blitz-server"
import { appOrigin } from "src/server/auth/email"
import {
  exchangeGmailCode,
  gmailCallbackError,
  gmailCredentials,
  gmailRedirectUri,
  grantProblem,
  revokeGoogleToken,
} from "src/server/gmail/oauth"
import { createGmailReader } from "src/server/gmail/reader"
import { saveGmailGrant } from "src/server/gmail/service"
import { tokenKeyReady } from "src/server/gmail/token-crypto"

const COOKIE_PATH = "/api/auth/gmail"

function back(result: string): never {
  redirect(`/settings?gmail=${result}#st-gmail`)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const jar = await cookies()
  const expected = jar.get("gmail_oauth_state")?.value
  const verifier = jar.get("gmail_oauth_verifier")?.value
  jar.delete({ name: "gmail_oauth_state", path: COOKIE_PATH })
  jar.delete({ name: "gmail_oauth_verifier", path: COOKIE_PATH })

  const ctx = await getBlitzContext()
  const userId = ctx.session.userId
  const state = url.searchParams.get("state")
  if (!userId || !expected || !verifier || state !== expected.split(".")[1]) back("state")
  if (expected.split(".")[0] !== String(userId)) back("state")
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || user.role === "GUEST") back("state")

  const declined = gmailCallbackError(url.searchParams)
  if (declined) back(declined)
  const code = url.searchParams.get("code")
  if (!code) back("state")

  const credentials = gmailCredentials()
  if (!credentials) back("config")
  if (!tokenKeyReady()) back("key")
  const fetchImpl = (input: string, init?: RequestInit) => fetch(input, init)
  const grant = await exchangeGmailCode(
    {
      code,
      codeVerifier: verifier,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: gmailRedirectUri(appOrigin()),
    },
    fetchImpl
  )
  if (!grant) back("exchange")

  // The person can untick the box on Google's screen, and a broader grant is not one we keep.
  const problem = grantProblem(grant.scope)
  if (problem) {
    await revokeGoogleToken(grant.refreshToken ?? grant.accessToken, fetchImpl)
    back(problem === "missing" ? "scope-missing" : "scope-broader")
  }
  if (!grant.refreshToken) back("exchange")

  let result = "connected"
  try {
    const email = await createGmailReader(grant.accessToken, fetchImpl).mailbox()
    await saveGmailGrant({ userId, email, refreshToken: grant.refreshToken }, fetchImpl)
  } catch {
    await revokeGoogleToken(grant.refreshToken, fetchImpl)
    result = "exchange"
  }
  back(result)
}
