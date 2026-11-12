"use server"
import { resolver } from "src/server/rpc"
import { AuthenticationError } from "src/shared/errors"
import { z } from "zod"
import { sessionRole } from "src/server/auth/accounts"
import { takeLinkRequest } from "src/server/auth/link-request"
import { signInWithMagicLink } from "src/server/auth/sign-in-link"

/**
 * Called from the button on /login/verify, never on page load: the page first shows which account
 * the link opens. Marks the email verified on first use; see signInWithMagicLink for guest data.
 */
export default resolver.pipe(
  resolver.zod(z.object({ token: z.string().min(20).max(200) })),
  async ({ token }, ctx) => {
    const signedIn = await signInWithMagicLink({
      token,
      sessionUserId: ctx.session.userId,
      linkRequestCookie: await takeLinkRequest(),
    })
    if (!signedIn) throw new AuthenticationError()
    const { user } = signedIn
    await ctx.session.$create({ userId: user.id, role: sessionRole(user.role) })
    return { ok: true }
  }
)
