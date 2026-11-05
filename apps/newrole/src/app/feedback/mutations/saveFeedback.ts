import { resolver } from "@blitzjs/rpc"
import { recordFeedback } from "src/server/preferences/feedback"
import { rethrow, userOrGuest } from "../guard"
import { SaveFeedbackInput } from "../schema"

/** Like / pass / applied, with optional "what you liked" aspects, tags and a note. Guests too. */
export default resolver.pipe(resolver.zod(SaveFeedbackInput), async (input, ctx) => {
  const userId = await userOrGuest(ctx.session)
  try {
    return await recordFeedback({ ...input, userId, channel: "web" })
  } catch (error) {
    rethrow(error)
  }
})
