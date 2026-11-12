"use server"
import { resolver } from "src/server/rpc"
import { createApplication } from "src/server/applications/service"
import { requireMember } from "src/app/users/guard"
import { CreateApplicationInput, rethrowApplication } from "../schema"

/** "Dodaj aplikację": by offer URL (filled from the index) or company + role. Dedupes by offer and URL. */
export default resolver.pipe(
  resolver.zod(CreateApplicationInput),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await createApplication({ ...input, userId, source: "manual", channel: "web" })
    } catch (error) {
      rethrowApplication(error)
    }
  }
)
