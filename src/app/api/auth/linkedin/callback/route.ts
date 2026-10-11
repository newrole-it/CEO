import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import db from "db"
import { upsertLinkedInUser } from "src/server/auth/accounts"
import { appOrigin } from "src/server/auth/email"
import { exchangeLinkedInCode } from "src/server/auth/linkedin"
import { hashLoginToken, MAGIC_LINK_TTL_MS, newLoginToken } from "src/server/auth/magic-link"
import { safeReturnTo } from "src/shared/return-to"

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const jar = await cookies()
  const expected = jar.get("linkedin_oauth_state")?.value
  const next = safeReturnTo(jar.get("linkedin_oauth_return")?.value)
  jar.delete("linkedin_oauth_state")
  jar.delete("linkedin_oauth_return")
  if (!code || !state || !expected || state !== expected) redirect("/login?error=linkedin")

  const clientId = process.env.LINKEDIN_CLIENT_ID?.trim()
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET?.trim()
  if (!clientId || !clientSecret) redirect("/login?error=linkedin-config")
  const redirectUri =
    process.env.LINKEDIN_REDIRECT_URI?.trim() || `${appOrigin()}/api/auth/linkedin/callback`
  const identity = await exchangeLinkedInCode(
    { code, clientId, clientSecret, redirectUri },
    (input, init) => fetch(input, init)
  )
  if (!identity) redirect("/login?error=linkedin")

  const user = await upsertLinkedInUser(identity)
  const token = newLoginToken()
  await db.loginLink.create({
    data: {
      email: user.email,
      hashedToken: hashLoginToken(token),
      expiresAt: new Date(Date.now() + MAGIC_LINK_TTL_MS),
    },
  })
  const nextQuery = next ? `&next=${encodeURIComponent(next)}` : ""
  redirect(`/login/verify?token=${encodeURIComponent(token)}${nextQuery}`)
}
