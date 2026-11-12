"use server"
import { resolver } from "src/server/rpc"
import { requireMember } from "src/app/users/guard"
import { deleteAnswer } from "src/server/answers/service"
import { IdInput, rethrowAnswer } from "../schema"

export default resolver.pipe(resolver.zod(IdInput), async ({ id }, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    await deleteAnswer(userId, id)
    return { id }
  } catch (error) {
    rethrowAnswer(error)
  }
})
