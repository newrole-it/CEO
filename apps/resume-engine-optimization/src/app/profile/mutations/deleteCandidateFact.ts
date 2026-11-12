"use server"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"
import { z } from "zod"
import { deleteFact } from "src/server/profile/facts"
import { requireMember } from "src/app/users/guard"

/** Takes back one fact the person added on a point of a match. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  resolver.authorize(),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    if (!(await deleteFact(userId, id))) throw new NotFoundError()
    return { ok: true }
  }
)
