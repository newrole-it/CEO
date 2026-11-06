import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { duplicateCv, listCvs } from "src/server/cv/service"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** A copy of a CV, with a copy of its general letter; returns the list, which then has both. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await duplicateCv(userId, id)
      return await listCvs(userId, { letters: true })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
