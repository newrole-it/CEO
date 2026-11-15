"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { saveGathered } from "src/server/cv/gather"
import { rethrowCv } from "../guard"

/** Stores a gathered draft the person accepted as a new version of the general CV. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      targetId: z.string().min(1).max(64),
      updatedAt: z.string().min(1).max(40),
      sources: z
        .array(z.object({ id: z.string().min(1).max(64), hash: z.string().min(1).max(128) }))
        .max(500),
      content: z.unknown(),
    })
  ),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await saveGathered({ ...input, userId })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
