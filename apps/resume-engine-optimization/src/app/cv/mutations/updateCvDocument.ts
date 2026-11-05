import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { updateCv } from "src/server/cv/service"
import { CvContent } from "@newrole/cv-core/schema"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/**
 * Autosave from the editor: title, language and/or the whole content. `baseUpdatedAt` is the
 * version the editor holds; a newer stored CV fails with the message "conflict".
 */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      title: z.string().max(200).optional(),
      language: z.enum(["pl", "en"]).optional(),
      content: CvContent.optional(),
      baseUpdatedAt: z.date().optional(),
    })
  ),
  async ({ id, ...patch }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const cv = await updateCv(userId, id, patch)
      return { id: cv.id, updatedAt: cv.updatedAt }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
