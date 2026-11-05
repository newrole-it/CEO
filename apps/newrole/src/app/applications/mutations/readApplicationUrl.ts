import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { checkOfferUrl } from "src/server/applications/read-offer"
import { requireMember } from "src/app/users/guard"

/** "Dodaj aplikację": reads a link the index does not know. May add the offer to the index. */
export default resolver.pipe(
  resolver.zod(z.object({ url: z.string().max(2000) })),
  resolver.authorize(),
  async ({ url }, ctx) => {
    const userId = requireMember(ctx.session)
    await assertOfferReadLimit(userId)
    return checkOfferUrl(userId, url, { read: true })
  }
)
