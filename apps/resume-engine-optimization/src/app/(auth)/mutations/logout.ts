"use server"
import { resolver } from "src/server/rpc"

export default resolver.pipe(async (_: null, ctx) => {
  await ctx.session.$revoke()
})
