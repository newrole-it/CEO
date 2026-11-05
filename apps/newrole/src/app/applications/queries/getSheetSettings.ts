import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { appsScriptSource, ensureSheetLink, sheetStatus } from "src/server/applications/sheet"
import { requireMember } from "src/app/users/guard"

/** Settings → Arkusz Google: connection state and the Apps Script with this person's secret. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const link = await ensureSheetLink(userId)
  const status = await sheetStatus(userId)
  return { status, script: appsScriptSource(link.secret) }
})
