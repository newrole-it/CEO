import { resolver } from "@blitzjs/rpc"
import { addOffer, newOfferInput } from "src/server/jobs/add-offer"
import { requireMember } from "src/app/feedback/guard"

/** "Dodaj ofertę": stores the offer as the person checked it. */
export default resolver.pipe(
  resolver.zod(newOfferInput),
  resolver.authorize(),
  async (input, ctx) => {
    requireMember(ctx.session)
    return addOffer(input)
  }
)
