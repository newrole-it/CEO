import { resolver } from "@blitzjs/rpc"
import { syncStatus } from "src/server/sync/status"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) =>
  syncStatus(ctx.session.userId!)
)
