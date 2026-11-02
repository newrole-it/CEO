import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { gmailStatus, mailLog } from "src/server/gmail/service"

/**
 * Was "Sprawdź teraz". The mailbox is no longer searched, so this only reports; nothing calls it
 * any more and it can be deleted together with src/server/gmail/sync.ts.
 */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const [status, log] = await Promise.all([gmailStatus(userId), mailLog(userId)])
  return { result: { status: "not-connected" as const }, status, log }
})
