"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { mailInbox } from "src/server/gmail/service"

/** What Gmail changed lately and what waits for the person, above the tracker. */
export default resolver.pipe(resolver.zod(z.object({})), resolver.authorize(), async (_, ctx) => {
  return mailInbox(requireMember(ctx.session))
})
