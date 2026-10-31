import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { saveGmailSettings } from "src/server/gmail/service"

export default resolver.pipe(
  resolver.zod(z.object({ autoApply: z.boolean().optional(), useModel: z.boolean().optional() })),
  resolver.authorize(),
  async (patch, ctx) => saveGmailSettings(requireMember(ctx.session), patch)
)
