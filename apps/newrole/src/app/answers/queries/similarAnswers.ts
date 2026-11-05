import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { searchAnswers } from "src/server/answers/service"
import { SimilarAnswersInput } from "../schema"

/** The most similar stored answers to a question, with scores (deterministic, no model). */
export default resolver.pipe(
  resolver.zod(SimilarAnswersInput),
  async ({ question, limit }, ctx) => {
    const userId = requireMember(ctx.session)
    if (!question.trim()) return []
    return searchAnswers(userId, { question, limit: limit ?? 5 })
  }
)
