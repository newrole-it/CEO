import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { improveCvSection } from "src/server/cv/improve"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Popraw z AI": one section rewritten by the model, for the person to look at; nothing is stored. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      sectionId: z.string().min(1).max(64),
      mode: z.enum(["polish", "shorten", "stronger"]),
      note: z.string().max(2000).optional(),
      locale: z.enum(["pl", "en"]).optional(),
      attempt: z.number().int().min(1).max(50).optional(),
    })
  ),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await improveCvSection({ ...input, userId })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
