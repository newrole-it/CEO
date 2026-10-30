import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { applicationStats, listApplications } from "src/server/applications/service"
import { requireMember } from "src/app/feedback/guard"
import { GroupInput } from "../schema"

/** The tracker table plus the stats strip. Filtering by group and search also works client-side. */
export default resolver.pipe(
  resolver.zod(z.object({ group: GroupInput.optional(), q: z.string().max(160).optional() })),
  resolver.authorize(),
  async ({ group, q }, ctx) => {
    const userId = requireMember(ctx.session)
    const [items, stats] = await Promise.all([
      listApplications(userId, { group: group ?? "all", q }),
      applicationStats(userId),
    ])
    return { items, stats }
  }
)
