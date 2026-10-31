import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { gmailStatus, mailLog } from "src/server/gmail/service"
import { syncGmail } from "src/server/gmail/sync"

/** "Sprawdź teraz". Bounded, so the button comes back; the worker picks up the rest in a minute. */
const WEB_BUDGET_MS = 45_000

export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const result = await syncGmail(userId, { budgetMs: WEB_BUDGET_MS })
  const [status, log] = await Promise.all([gmailStatus(userId), mailLog(userId)])
  return { result, status, log }
})
