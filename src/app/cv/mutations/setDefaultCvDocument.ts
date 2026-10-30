import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { setDefaultCv } from "src/server/cv/service"
import { requireMember } from "src/app/feedback/guard"
import { rethrowCv } from "../guard"

export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await setDefaultCv(userId, id)
      return { ok: true }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
