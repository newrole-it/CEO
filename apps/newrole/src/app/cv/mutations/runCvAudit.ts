import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { runCvAudit } from "src/server/cv/audit-store"
import { requireMember } from "src/app/feedback/guard"
import { rethrowCv } from "../guard"

/** Audits the saved CV. The editor saves first, so this reads what is on the screen. */
export default resolver.pipe(
  resolver.zod(z.object({ id: z.string().min(1).max(64), locale: z.enum(["pl", "en"]) })),
  async ({ id, locale }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await runCvAudit(userId, id, locale)
    } catch (error) {
      rethrowCv(error)
    }
  }
)
