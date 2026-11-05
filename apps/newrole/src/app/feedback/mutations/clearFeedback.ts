import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { clearFeedback } from "src/server/preferences/feedback"
import { requireMember } from "../guard"

/** Back to undecided (also the undo for saveFeedback when there was no earlier verdict). */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ jobId }, ctx) => {
    const userId = requireMember(ctx.session)
    await clearFeedback(userId, jobId)
    return { jobId }
  }
)
