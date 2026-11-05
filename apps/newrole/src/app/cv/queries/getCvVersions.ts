import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { listVersions } from "src/server/cv/versions"
import { requireMember } from "src/app/users/guard"

/** The history panel: every version without its content. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => listVersions(requireMember(ctx.session), id)
)
