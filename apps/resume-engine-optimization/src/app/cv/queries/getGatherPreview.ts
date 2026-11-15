"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { gatherPreview } from "src/server/cv/gather"

/**
 * Before "Zbierz wszystko do CV ogólnego": the general CV it would go into and the other CVs
 * that hold something the person added by hand. `targetId` picks a general CV other than the default.
 */
export default resolver.pipe(
  resolver.zod(z.object({ targetId: z.string().min(1).max(64).optional() })),
  async ({ targetId }, ctx) => gatherPreview(requireMember(ctx.session), targetId)
)
