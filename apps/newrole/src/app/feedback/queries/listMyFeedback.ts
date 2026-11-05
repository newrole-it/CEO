import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { listFeedback } from "src/server/preferences/feedback"
import { requireMember } from "../guard"
import { VerdictInput } from "../schema"

/** Your likes, passes and applications, newest first. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      verdict: VerdictInput.optional(),
      limit: z.number().int().min(1).max(500).optional(),
    })
  ),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    return listFeedback(userId, input)
  }
)
