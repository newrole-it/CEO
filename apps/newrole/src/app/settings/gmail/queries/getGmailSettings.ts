import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { gmailStatus, mailLog } from "src/server/gmail/service"

/** Settings → Gmail: a mailbox left connected by an earlier version, and the messages used so far. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const [status, log] = await Promise.all([gmailStatus(userId), mailLog(userId)])
  return { status, log }
})
