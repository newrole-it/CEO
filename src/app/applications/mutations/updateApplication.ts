import { resolver } from "@blitzjs/rpc"
import { updateApplication } from "src/server/applications/service"
import { requireMember } from "src/app/feedback/guard"
import { rethrowApplication, UpdateApplicationInput } from "../schema"

/** Status, stage label, next step, contact, notes and the other fields; each change lands on the timeline. */
export default resolver.pipe(
  resolver.zod(UpdateApplicationInput),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await updateApplication({ ...input, userId, channel: "web" })
    } catch (error) {
      rethrowApplication(error)
    }
  }
)
