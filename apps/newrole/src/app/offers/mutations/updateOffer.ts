import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { updateOffer } from "src/server/offers/service"
import { requireMember } from "src/app/users/guard"

/** The offer's text in the person's words, or their note on it. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      text: z.string().max(60_000).nullable().optional(),
      note: z.string().max(4000).nullable().optional(),
    })
  ),
  resolver.authorize(),
  async ({ jobId, text, note }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await updateOffer(userId, jobId, { text, note })
    } catch (error) {
      if (error instanceof Error && error.message === "job-not-found") throw new NotFoundError()
      throw error
    }
    return { ok: true }
  }
)
