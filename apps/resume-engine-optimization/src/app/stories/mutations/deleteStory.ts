"use server"
import { resolver } from "src/server/rpc"
import { requireMember } from "src/app/users/guard"
import { deleteStory } from "src/server/interview/stories"
import { IdInput, rethrowStory } from "../schema"

export default resolver.pipe(resolver.zod(IdInput), async ({ id }, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    await deleteStory(userId, id)
    return { id }
  } catch (error) {
    rethrowStory(error)
  }
})
