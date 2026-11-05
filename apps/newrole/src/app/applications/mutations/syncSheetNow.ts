import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { sheetStatus, syncSheet } from "src/server/applications/sheet"
import { requireMember } from "src/app/users/guard"

/** "Synchronizuj teraz": sends the whole table to the sheet without waiting for the worker. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  const userId = requireMember(ctx.session)
  const sync = await syncSheet(userId)
  return { status: await sheetStatus(userId), sync }
})
