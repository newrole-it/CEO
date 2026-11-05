import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { refreshOfferText } from "src/server/offers/service"
import { requireMember } from "src/app/users/guard"

/** Read the offer from its source again; the new text replaces the person's copy. */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ jobId }, ctx) => {
    const userId = requireMember(ctx.session)
    await assertOfferReadLimit(userId)
    return { result: await refreshOfferText(userId, jobId) }
  }
)
