"use server"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"
import { getApplication } from "src/server/applications/service"
import { requireMember } from "src/app/users/guard"
import { IdInput } from "../schema"

/** The drawer: application with its timeline, answers given and the CV used. */
export default resolver.pipe(resolver.zod(IdInput), resolver.authorize(), async ({ id }, ctx) => {
  const userId = requireMember(ctx.session)
  const detail = await getApplication(userId, id)
  if (!detail) throw new NotFoundError("Application not found")
  return detail
})
