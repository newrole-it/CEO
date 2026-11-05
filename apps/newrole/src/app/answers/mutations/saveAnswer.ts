import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { saveAnswer } from "src/server/answers/service"
import { rethrowAnswer, SaveAnswerInput } from "../schema"

/** Create (or count an identical answer as a use) or update by id. Guests too. */
export default resolver.pipe(resolver.zod(SaveAnswerInput), async (input, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    return await saveAnswer({ ...input, userId, origin: input.origin ?? "manual" })
  } catch (error) {
    rethrowAnswer(error)
  }
})
