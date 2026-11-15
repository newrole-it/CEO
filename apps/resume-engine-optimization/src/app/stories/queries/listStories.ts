"use server"
import { z } from "zod"
import { resolver } from "src/server/rpc"
import { requireMember } from "src/app/users/guard"
import { listStories } from "src/server/interview/stories"

/** The person's stories, saved and draft, newest first. Guests too. */
export default resolver.pipe(resolver.zod(z.object({})), async (_input, ctx) => {
  const userId = requireMember(ctx.session)
  return listStories(userId)
})
