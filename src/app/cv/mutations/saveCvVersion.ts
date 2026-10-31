import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { saveVersion } from "src/server/cv/versions"
import { requireMember } from "src/app/feedback/guard"

/** "Zapisz wersję": keeps what is stored now under a name. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      label: z.string().max(200).optional(),
    })
  ),
  async ({ id, label }, ctx) => {
    const userId = requireMember(ctx.session)
    const saved = await saveVersion(userId, id, label)
    if (!saved) throw new NotFoundError("CV not found.")
    return saved
  }
)
