import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { answerBankStats, searchAnswers } from "src/server/answers/service"
import { SearchAnswersInput } from "../schema"

/** The bank, or a text and tag search over it, plus the counts the screen shows. Guests too. */
export default resolver.pipe(resolver.zod(SearchAnswersInput), async (input, ctx) => {
  const userId = requireMember(ctx.session)
  const [rows, stats] = await Promise.all([
    searchAnswers(userId, { q: input.q, tag: input.tag, limit: input.limit ?? 500 }),
    answerBankStats(userId),
  ])
  return { rows, stats }
})
