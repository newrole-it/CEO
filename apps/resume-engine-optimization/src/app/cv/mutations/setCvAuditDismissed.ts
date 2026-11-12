"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { setCvAuditDismissed } from "src/server/cv/audit-store"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Pomiń" on an audit note, and bringing skipped notes back. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      dismissed: z.array(z.string().min(1).max(40)).max(16),
    })
  ),
  async ({ id, dismissed }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await setCvAuditDismissed(userId, id, dismissed)
    } catch (error) {
      rethrowCv(error)
    }
  }
)
