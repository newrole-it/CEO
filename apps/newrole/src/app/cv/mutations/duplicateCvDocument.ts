import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { duplicateCv } from "src/server/cv/service"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const { content: _content, ...view } = await duplicateCv(userId, id)
      return view
    } catch (error) {
      rethrowCv(error)
    }
  }
)
