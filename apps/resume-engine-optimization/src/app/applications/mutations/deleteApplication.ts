"use server"
import { resolver } from "src/server/rpc"
import { deleteApplication } from "src/server/applications/service"
import { requireMember } from "src/app/users/guard"
import { IdInput, rethrowApplication } from "../schema"

export default resolver.pipe(resolver.zod(IdInput), resolver.authorize(), async ({ id }, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    await deleteApplication(userId, id)
    return { id }
  } catch (error) {
    rethrowApplication(error)
  }
})
