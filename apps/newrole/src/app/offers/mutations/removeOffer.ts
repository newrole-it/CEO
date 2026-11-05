import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { removeOffer } from "src/server/offers/service"
import { requireMember } from "src/app/users/guard"

/** Out of the person's list; the CVs, letters and the application written for it stay. */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ jobId }, ctx) => {
    const userId = requireMember(ctx.session)
    await removeOffer(userId, jobId)
    return { ok: true }
  }
)
