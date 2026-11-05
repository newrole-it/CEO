import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { findSimilarOffers } from "src/server/preferences/similar"
import { requireMember } from "../guard"
import { AspectInput, LocaleInput } from "../schema"

/** "Podobne do …": with jobId, offers like that one; without, offers like everything you liked. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64).optional(),
      limit: z.number().int().min(1).max(50).optional(),
      aspects: z.array(AspectInput).max(10).optional(),
      locale: LocaleInput,
    })
  ),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    return findSimilarOffers({ ...input, userId })
  }
)
