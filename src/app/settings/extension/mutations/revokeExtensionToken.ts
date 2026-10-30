import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { revokeApiToken } from "src/server/auth/api-tokens"

export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    return { revoked: await revokeApiToken(userId, id) }
  }
)
