import { resolver } from "@blitzjs/rpc"
import { SecurePassword } from "@blitzjs/auth/secure-password"
import { AuthenticationError, NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"
import { revokeOtherAccess } from "src/server/auth/accounts"
import { password } from "../validations"

/**
 * Sets a password on an account that has none, or changes it when `currentPassword` matches.
 * Guests cannot set one: they save the account with an email first. Every other session and every
 * extension token ends, so someone who knew the old password keeps no way in.
 */
export default resolver.pipe(
  resolver.zod(
    z.object({ currentPassword: z.string().max(100).optional(), newPassword: password })
  ),
  resolver.authorize(),
  async ({ currentPassword, newPassword }, ctx) => {
    const user = await db.user.findUnique({ where: { id: ctx.session.userId! } })
    if (!user || user.role === "GUEST") throw new NotFoundError()
    if (user.hashedPassword) {
      const result = await SecurePassword.verify(user.hashedPassword, currentPassword ?? "").catch(
        () => SecurePassword.INVALID
      )
      if (result !== SecurePassword.VALID && result !== SecurePassword.VALID_NEEDS_REHASH) {
        throw new AuthenticationError("current-password")
      }
    }
    await db.user.update({
      where: { id: user.id },
      data: { hashedPassword: await SecurePassword.hash(newPassword) },
    })
    await revokeOtherAccess(user.id, ctx.session.$handle)
    await db.auditEvent.create({ data: { userId: user.id, action: "password.set" } })
    return { ok: true }
  }
)
