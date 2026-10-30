import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { deleteCv, listCvs } from "src/server/cv/service"
import { requireMember } from "src/app/feedback/guard"
import { rethrowCv } from "../guard"

/** Deletes a CV; a deleted default promotes the newest. Returns the list so the UI shows the new default. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await deleteCv(userId, id)
      return await listCvs(userId)
    } catch (error) {
      rethrowCv(error)
    }
  }
)
