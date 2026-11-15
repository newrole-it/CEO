"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { draftGather } from "src/server/cv/gather"
import { rethrowCv } from "../guard"

/**
 * "Zbierz wszystko do CV ogólnego": the general CV with the person's changes from their other CVs
 * merged in by the model, for the person to look at; nothing is stored.
 */
export default resolver.pipe(
  resolver.zod(z.object({ targetId: z.string().min(1).max(64) })),
  async ({ targetId }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await draftGather({ userId, targetId, locale: await getLocale() })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
