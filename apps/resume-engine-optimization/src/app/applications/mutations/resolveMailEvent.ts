"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { mailInbox, resolveMailEvent } from "src/server/gmail/service"
import { rethrowApplication } from "../schema"

/** Apply or skip a suggestion from Gmail, or undo a change it made on its own. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      action: z.enum(["apply", "dismiss", "undo"]),
      applicationId: z.string().min(1).max(64).nullable().optional(),
    })
  ),
  resolver.authorize(),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const result = await resolveMailEvent({ userId, ...input })
      return { ...result, inbox: await mailInbox(userId) }
    } catch (error) {
      rethrowApplication(error)
    }
  }
)
