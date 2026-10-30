import { resolver } from "@blitzjs/rpc"
import db from "db"
import { z } from "zod"
import { claimGuest, sessionRole } from "src/server/auth/accounts"
import { magicLinkUrl, sendMagicLinkEmail } from "src/server/auth/email"
import { AuthRateLimitError, issueMagicLink } from "src/server/auth/magic-link"

/**
 * The caller's IP for the per-IP limit. The session has no headers, so read the request's.
 * Imported on call: LoginForm imports this file, and a static next/headers import fails the
 * client-layer build.
 */
async function clientIp(): Promise<string> {
  const { headers } = await import("next/headers")
  const list = await headers()
  return list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local"
}

export default resolver.pipe(
  resolver.zod(z.object({ email: z.string().trim().email().max(180) })),
  async ({ email }, ctx) => {
    const normalized = email.toLowerCase()
    const existing = await db.user.findUnique({ where: { email: normalized } })
    const sessionUserId = ctx.session.userId ?? null

    if (!existing || (sessionUserId === existing.id && existing.role === "GUEST")) {
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

    if (sessionUserId === existing.id) return { status: "signed-in" as const }

    try {
      const token = await issueMagicLink(normalized, await clientIp())
      await sendMagicLinkEmail(normalized, magicLinkUrl(token))
    } catch (error) {
      if (error instanceof AuthRateLimitError) return { status: "limited" as const }
      throw error
    }
    return { status: "link-sent" as const }
  }
)
