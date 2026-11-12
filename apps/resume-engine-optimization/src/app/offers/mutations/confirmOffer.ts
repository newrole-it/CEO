"use server"
import { resolver } from "src/server/rpc"
import { confirmOffer, confirmOfferInput } from "src/server/offers/service"
import { requireMember } from "src/app/users/guard"

/** "Dodaj ofertę": stores a draft as the person checked it, with the text they kept. */
export default resolver.pipe(
  resolver.zod(confirmOfferInput),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    return confirmOffer(userId, input)
  }
)
