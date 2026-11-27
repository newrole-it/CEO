"use server"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { dismissSearchResult } from "src/server/offer-search/service"
import { OfferSearchError } from "src/server/offer-search/run"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"

/** "Not interested" on a result: it leaves the lists and later searches skip its link. */
export default resolver.pipe(
  resolver.zod(z.object({ resultId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ resultId }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await dismissSearchResult(userId, resultId)
    } catch (error) {
      if (error instanceof OfferSearchError) throw new NotFoundError(error.code)
      throw error
    }
  }
)
