import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { appOrigin } from "src/server/auth/email"
import { gmailSetup } from "src/server/gmail/oauth"
import { gmailStatus, mailLog } from "src/server/gmail/service"

/** Settings → Gmail: whether it can connect, the connection, and every message read so far. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const [status, log] = await Promise.all([gmailStatus(userId), mailLog(userId)])
  return { setup: gmailSetup(appOrigin()), status, log }
})
