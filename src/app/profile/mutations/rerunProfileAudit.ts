import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { runProfileAuditForUser } from "src/server/profile/audit-store"

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(z.object({})),
  async (_input, ctx) => {
    const audit = await runProfileAuditForUser(ctx.session.userId!)
    if (!audit) throw new NotFoundError("Import a LinkedIn PDF before running the audit.")
    return { score: audit.score, previousScore: audit.previousScore }
  }
)
