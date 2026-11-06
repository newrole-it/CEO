import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { saveToGeneralCv } from "src/server/cv/tailor"
import { requireMember } from "src/app/users/guard"

/** "Zapisz jako ogólne CV": a CV for an offer becomes a version of its general CV. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    const saved = await saveToGeneralCv(userId, id)
    if (!saved) throw new NotFoundError("General CV not found.")
    return saved
  }
)
