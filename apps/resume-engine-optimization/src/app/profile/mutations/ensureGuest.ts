import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { userOrGuest } from "src/app/users/guard"

/**
 * Reading a CV needs a session (it calls the model), so a first-time visitor gets the guest
 * session saveProfile would create a moment later anyway. Nothing happens when one exists.
 */
export default resolver.pipe(resolver.zod(z.null().optional()), async (_input, ctx) => {
  await userOrGuest(ctx.session)
  return { ok: true }
})
