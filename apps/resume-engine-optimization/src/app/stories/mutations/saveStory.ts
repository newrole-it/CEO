"use server"
import { resolver } from "src/server/rpc"
import { requireMember } from "src/app/users/guard"
import { saveStory } from "src/server/interview/stories"
import { rethrowStory, SaveStoryInput } from "../schema"

/** Adds a story or updates one by id. Saving a draft makes it the person's own. Guests too. */
export default resolver.pipe(resolver.zod(SaveStoryInput), async (input, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    return await saveStory(userId, { ...input, origin: "manual" })
  } catch (error) {
    rethrowStory(error)
  }
})
