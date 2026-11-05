import db from "db"
import { claimGuest } from "src/server/auth/accounts"
import { linkRequestedHere } from "src/server/auth/link-request"
import { consumeMagicLink } from "src/server/auth/magic-link"

/**
 * Uses up a sign-in link and returns its account, or null for a used, expired or unknown token.
 * The current guest's data moves to the account only when this browser asked for the link.
 */
export async function signInWithMagicLink(input: {
  token: string
  sessionUserId: number | null | undefined
  linkRequestCookie: string | null | undefined
}) {
  const email = await consumeMagicLink(input.token)
  const user = email ? await db.user.findUnique({ where: { email } }) : null
  if (!user) return null
  if (!user.emailVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } })
  }
  const guestId = input.sessionUserId
  const claim = Boolean(
    guestId && guestId !== user.id && linkRequestedHere(input.linkRequestCookie, user.email)
  )
  if (claim) await claimGuest(guestId!, user.id)
  return { user, claimedGuest: claim }
}
