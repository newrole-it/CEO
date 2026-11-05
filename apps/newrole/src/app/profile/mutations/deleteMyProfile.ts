import { resolver } from "@blitzjs/rpc"
import { eraseProfile } from "src/server/privacy/erase"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  await eraseProfile(ctx.session.userId!)
  return { deleted: "profile" as const }
})
