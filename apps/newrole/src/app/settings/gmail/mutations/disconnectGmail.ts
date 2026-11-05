import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { disconnectGmail, gmailStatus } from "src/server/gmail/service"

export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const { revoked } = await disconnectGmail(userId)
  return { revoked, status: await gmailStatus(userId) }
})
