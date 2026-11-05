import { resolver } from "@blitzjs/rpc"
import { AuthorizationError } from "blitz"
import { z } from "zod"
import db from "db"
import { requireMember } from "src/app/users/guard"
import { createApiToken } from "src/server/auth/api-tokens"

/** A token to paste by hand. Returned once; only the hash stays. Guests cannot have tokens. */
export default resolver.pipe(
  resolver.zod(z.object({ name: z.string().trim().min(1).max(80) })),
  async ({ name }, ctx) => {
    const userId = requireMember(ctx.session)
    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user || user.role === "GUEST") throw new AuthorizationError()
    return createApiToken(userId, name)
  }
)
