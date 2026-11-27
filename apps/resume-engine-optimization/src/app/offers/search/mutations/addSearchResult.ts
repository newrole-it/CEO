"use server"
import { z } from "zod"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { addSearchResult } from "src/server/offer-search/service"
import { OfferSearchError } from "src/server/offer-search/run"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"

/** "Add" on a result: keeps the offer and evaluates it against the person's profile. */
export default resolver.pipe(
  resolver.zod(z.object({ resultId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ resultId }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await addSearchResult(userId, resultId, await getLocale())
    } catch (error) {
      if (error instanceof OfferSearchError) throw new NotFoundError(error.code)
      throw error
    }
  }
)
