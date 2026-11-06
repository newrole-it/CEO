import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { deleteCv, listCvs } from "src/server/cv/service"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/**
 * Deletes a CV, and its general letter with `withLetter`; a deleted default promotes the newest.
 * Returns the list so the UI shows the new default.
 */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64), withLetter: z.boolean().optional() })),
  async ({ id, withLetter }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      await deleteCv(userId, id, { withLetter })
      return await listCvs(userId, { letters: true })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
