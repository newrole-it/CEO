import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { addOfferByLink } from "src/server/offers/service"
import { requireMember } from "src/app/users/guard"

/** "Dodaj ofertę": the offer behind a link, read whole and kept, or a draft of what the page says. */
export default resolver.pipe(
  resolver.zod(z.object({ url: z.string().max(2000) })),
  resolver.authorize(),
  async ({ url }, ctx) => {
    const userId = requireMember(ctx.session)
    await assertOfferReadLimit(userId)
    return addOfferByLink(userId, url)
  }
)
