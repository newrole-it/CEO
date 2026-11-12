"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { CvSection } from "@newrole/cv-core/schema"
import { applyCvSection } from "src/server/cv/improve"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** Applies a section "Popraw z AI" wrote; the CV's state before stays in its history. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64), section: CvSection })),
  async ({ id, section }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await applyCvSection(userId, id, section)
    } catch (error) {
      rethrowCv(error)
    }
  }
)
