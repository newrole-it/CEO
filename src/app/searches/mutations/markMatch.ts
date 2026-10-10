import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(
    z.object({
      id: z.string().min(1),
      action: z.enum(["seen", "dismiss", "restore", "undecided", "interested"]),
    })
  ),
  async ({ id, action }, ctx) => {
    const match = await db.jobMatch.findFirst({
      where: { id, savedSearch: { userId: ctx.session.userId! } },
    })
    if (!match) throw new NotFoundError("Match not found")
    const now = new Date()
    await db.jobMatch.update({
      where: { id },
      data: {
        seenAt: action === "seen" ? now : match.seenAt,
        dismissedAt:
          action === "dismiss"
            ? now
            : action === "restore" || action === "undecided" || action === "interested"
            ? null
            : match.dismissedAt,
        interestedAt:
          action === "interested"
            ? now
            : action === "dismiss" || action === "restore" || action === "undecided"
            ? null
            : match.interestedAt,
      },
    })
    return { id }
  }
)
