import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import db from "db"
import { upsertLinkedInUser } from "src/server/auth/accounts"
import { appOrigin } from "src/server/auth/email"
import {
  exchangeLinkedInCode,
  linkedInCallbackError,
  linkedInCredentials,
  linkedInRedirectUri,
} from "src/server/auth/linkedin"
import { hashLoginToken, MAGIC_LINK_TTL_MS, newLoginToken } from "src/server/auth/magic-link"
import { safeReturnTo } from "src/shared/return-to"

/** LinkedIn gives name, email, and picture only. A new account goes on to import a CV. */
const FIRST_RUN = "/start?step=profile&via=linkedin"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const jar = await cookies()
  const expected = jar.get("linkedin_oauth_state")?.value
  const next = safeReturnTo(jar.get("linkedin_oauth_return")?.value)
  jar.delete("linkedin_oauth_state")
  jar.delete("linkedin_oauth_return")
  const declined = linkedInCallbackError(url.searchParams)
  if (declined) redirect(`/login?error=${declined}`)
  if (!code || !state || !expected || state !== expected) redirect("/login?error=linkedin-state")

  const credentials = linkedInCredentials()
  if (!credentials) redirect("/login?error=linkedin-config")
  const identity = await exchangeLinkedInCode(
    {
      code,
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      redirectUri: linkedInRedirectUri(appOrigin()),
    },
    (input, init) => fetch(input, init)
  )
  if (!identity) redirect("/login?error=linkedin-exchange")

  const user = await upsertLinkedInUser(identity)
  const hasProfile = await db.candidateProfile.count({ where: { userId: user.id } })
  const token = newLoginToken()
  await db.loginLink.create({
    data: {
      email: user.email,
      hashedToken: hashLoginToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  })
  const target = next ?? (hasProfile ? null : FIRST_RUN)
  const nextQuery = target ? `&next=${encodeURIComponent(target)}` : ""
  redirect(`/login/verify?token=${encodeURIComponent(token)}${nextQuery}`)
}
