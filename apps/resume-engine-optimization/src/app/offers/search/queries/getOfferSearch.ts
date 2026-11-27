"use server"
import { requireMember } from "src/app/users/guard"
import { getOfferSearchView } from "src/server/offer-search/service"
import { resolver } from "src/server/rpc"

/** The "Find offers" page: the person's latest search with its results, and the filters to propose. */
export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  return getOfferSearchView(requireMember(ctx.session))
})
