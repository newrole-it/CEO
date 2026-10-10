import { resolver } from "@blitzjs/rpc"
import { loadProfileAudit } from "src/server/profile/audit-store"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  return loadProfileAudit(ctx.session.userId!)
})
