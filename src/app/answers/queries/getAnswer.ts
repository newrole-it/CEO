import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { requireMember } from "src/app/feedback/guard"
import { answerVariants, getAnswer } from "src/server/answers/service"
import { IdInput } from "../schema"

/** One answer with every variant stored for the same question. */
export default resolver.pipe(resolver.zod(IdInput), async ({ id }, ctx) => {
  const userId = requireMember(ctx.session)
  const answer = await getAnswer(userId, id)
  if (!answer) throw new NotFoundError("Answer not found")
  return { answer, variants: await answerVariants(userId, answer.questionKey) }
})
