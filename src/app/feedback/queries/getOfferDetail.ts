import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { getOfferDetail } from "src/server/preferences/detail"
import { optionalUser } from "../guard"
import { LocaleInput } from "../schema"

/**
 * The offer drawer: card, score parts with maxima, industry/skill/preference adjustments,
 * reasons flagged profile vs feedback, tags and your saved feedback. Works for guests
 * (no personal parts) and signed-in users.
 */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64), locale: LocaleInput })),
  async ({ jobId, locale }, ctx) => {
    const detail = await getOfferDetail(jobId, optionalUser(ctx.session), locale ?? "pl")
    if (!detail) throw new NotFoundError("Offer not found")
    return detail
  }
)
