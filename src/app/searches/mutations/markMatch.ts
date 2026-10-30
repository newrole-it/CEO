import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"
import { clearFeedback, getFeedback, recordFeedback } from "src/server/preferences/feedback"

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(
    z.object({
      id: z.string().min(1),
      action: z.enum(["seen", "dismiss", "restore", "undecided", "interested"]),
    })
  ),
  async ({ id, action }, ctx) => {
    const userId = ctx.session.userId!
    const match = await db.jobMatch.findFirst({
      where: { id, savedSearch: { userId } },
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
    // One verdict per person and offer: keeps OfferFeedback (and the same offer in other searches) in step.
    if (action === "interested") {
      const existing = await getFeedback(userId, match.jobId)
      // "Applied" already means interested; do not downgrade it to a like.
      if (existing?.verdict !== "APPLIED") {
        await recordFeedback({ userId, jobId: match.jobId, verdict: "LIKE", channel: "web" })
      }
    } else if (action === "dismiss") {
      await recordFeedback({ userId, jobId: match.jobId, verdict: "DISLIKE", channel: "web" })
    } else if (action === "restore" || action === "undecided") {
      await clearFeedback(userId, match.jobId)
    }
    return { id }
  }
)
