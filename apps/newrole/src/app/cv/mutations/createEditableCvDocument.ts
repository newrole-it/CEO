import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { createEditableFromUpload } from "src/server/cv/structure"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Utwórz edytowalną wersję": reads an uploaded PDF into a new editable CV next to it. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64) })),
  async ({ id }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const { cv, reader } = await createEditableFromUpload(userId, id)
      return { id: cv.id, reader }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
