"use server"
import { z } from "zod"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { OfferSearchError } from "src/server/offer-search/run"
import { startSearchFromForm } from "src/server/offer-search/service"
import { resolver } from "src/server/rpc"
import { SearchFilters } from "src/shared/offer-search"

/**
 * "Search" on /offers/search. With `saveToProfile` the profile fields of the filters are written
 * once the search has started (startSearchFromForm). Without Claude Code it answers
 * `{ code: "no-cli" }` for the interface to translate.
 */
export default resolver.pipe(
  resolver.zod(z.object({ filters: SearchFilters, saveToProfile: z.boolean() })),
  resolver.authorize(),
  async ({ filters, saveToProfile }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await startSearchFromForm(userId, { filters, saveToProfile }, await getLocale())
    } catch (error) {
      if (error instanceof OfferSearchError && error.code === "no-cli") {
        return { code: "no-cli" as const }
      }
      throw error
    }
  }
)
