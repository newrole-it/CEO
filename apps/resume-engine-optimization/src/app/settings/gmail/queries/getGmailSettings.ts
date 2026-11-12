"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { gmailStatus, mailLog } from "src/server/gmail/service"

/** Settings → Gmail: a mailbox left connected by an earlier version, and the messages used so far. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const [status, log] = await Promise.all([gmailStatus(userId), mailLog(userId)])
  return { status, log }
})
