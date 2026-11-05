import { resolver } from "@blitzjs/rpc"
import db from "db"
import { z } from "zod"
import { actionForStatus, mergePlan } from "src/shared/triage"

const decision = z.object({
  jobId: z.string().min(1).max(80),
  action: z.enum(["undecided", "interested", "rejected"]),
  at: z.number().int().positive(),
})

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(z.object({ decisions: z.array(decision).max(200) })),
  async ({ decisions }, ctx) => {
    if (!decisions.length) return { applied: 0 }
    const jobIds = [...new Set(decisions.map((item) => item.jobId))]
    const matches = await db.jobMatch.findMany({
      where: { jobId: { in: jobIds }, savedSearch: { userId: ctx.session.userId! } },
      select: { id: true, jobId: true, interestedAt: true, dismissedAt: true },
    })
    const plan = mergePlan(decisions, matches)
    const now = new Date()
    for (const item of plan) {
      const action = actionForStatus(item.action)
      await db.jobMatch.update({
        where: { id: item.id },
        data: {
          interestedAt: action === "interested" ? now : null,
          dismissedAt: action === "dismiss" ? now : null,
        },
      })
    }
    return { applied: plan.length }
  }
)
