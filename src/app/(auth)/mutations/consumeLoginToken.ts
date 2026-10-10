import { resolver } from "@blitzjs/rpc"
import { AuthenticationError } from "blitz"
import db from "db"
import { z } from "zod"
import { claimGuest, sessionRole } from "src/server/auth/accounts"
import { consumeMagicLink } from "src/server/auth/magic-link"

export default resolver.pipe(
  resolver.zod(z.object({ token: z.string().min(20).max(200) })),
  async ({ token }, ctx) => {
    const email = await consumeMagicLink(token)
    const user = email ? await db.user.findUnique({ where: { email } }) : null
    if (!user) throw new AuthenticationError()
    const guestId = ctx.session.userId
    if (guestId && guestId !== user.id) await claimGuest(guestId, user.id)
    await ctx.session.$create({ userId: user.id, role: sessionRole(user.role) })
    return { ok: true }
  }
)
