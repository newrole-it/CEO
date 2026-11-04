import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import { readNewOffer } from "src/server/jobs/add-offer"
import { requireMember } from "src/app/feedback/guard"

/** "Dodaj ofertę": whether the index has the offer behind a link, else what the page says. */
export default resolver.pipe(
  resolver.zod(z.object({ url: z.string().max(2000) })),
  resolver.authorize(),
  async ({ url }, ctx) => {
    const userId = requireMember(ctx.session)
    await assertOfferReadLimit(userId)
    return readNewOffer(url)
  }
)
