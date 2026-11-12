"use server"
import { resolver } from "src/server/rpc"
import db from "db"
import { z } from "zod"
import { claimGuest, sessionRole } from "src/server/auth/accounts"
import { magicLinkUrl, sendMagicLinkEmail } from "src/server/auth/email"
import { rememberLinkRequest } from "src/server/auth/link-request"
import { AuthRateLimitError, issueMagicLink } from "src/server/auth/magic-link"
import { isLocalInstall } from "src/server/local-install"
import { requestClientIp } from "src/server/security/client-ip"

export default resolver.pipe(
  resolver.zod(z.object({ email: z.string().trim().email().max(180) })),
  async ({ email }, ctx) => {
    const normalized = email.toLowerCase()
    const existing = await db.user.findUnique({ where: { email: normalized } })
    const sessionUserId = ctx.session.userId ?? null

    // Locally the first email simply opens the account. On a server others use, an address has to
    // prove it is yours first, or anyone could take someone else's.
    const instant = isLocalInstall()
    if (instant && (!existing || (sessionUserId === existing.id && existing.role === "GUEST"))) {
      if (sessionUserId) {
        const current = await db.user.findUnique({ where: { id: sessionUserId } })
        if (current?.role === "GUEST") {
          const user = await db.user.update({
            where: { id: current.id },
            data: {
              email: normalized,
              role: "USER",
              emailVerifiedAt: new Date(),
              name: current.name === "Guest" ? null : current.name,
            },
          })
          await ctx.session.$create({ userId: user.id, role: sessionRole(user.role) })
          return { status: "signed-in" as const }
        }
      }
      const user = await db.user.create({
        data: { email: normalized, role: "USER", emailVerifiedAt: new Date() },
      })
      if (sessionUserId) await claimGuest(sessionUserId, user.id)
      await ctx.session.$create({ userId: user.id, role: "USER" as const })
      return { status: "signed-in" as const }
    }
    // An account that already exists opens the same way locally: the app listens only on this
    // machine, and a link would need a mail server nobody has set up yet.
    if (instant && existing && existing.role !== "GUEST") {
      if (sessionUserId) await claimGuest(sessionUserId, existing.id)
      await ctx.session.$create({ userId: existing.id, role: sessionRole(existing.role) })
      return { status: "signed-in" as const }
    }

    if (existing && sessionUserId === existing.id) return { status: "signed-in" as const }

    if (!existing) await db.user.create({ data: { email: normalized, role: "USER" } })

    try {
      const token = await issueMagicLink(normalized, await requestClientIp())
      await sendMagicLinkEmail(normalized, magicLinkUrl(token))
      await rememberLinkRequest(normalized)
    } catch (error) {
      if (error instanceof AuthRateLimitError) return { status: "limited" as const }
      throw error
    }
    return { status: "link-sent" as const }
  }
)
