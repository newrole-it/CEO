"use server"
import { resolver } from "src/server/rpc"
import { eraseAccount } from "src/server/privacy/erase"

export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  const result = await eraseAccount(ctx.session.userId!)
  await ctx.session.$revoke()
  return result
})
