import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { unwatchCompany } from "src/server/watchlist/watch"

export default resolver.pipe(
  resolver.zod(z.object({ companyId: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ companyId }, ctx) => {
    await unwatchCompany(ctx.session.userId!, companyId)
    return { companyId }
  }
)
