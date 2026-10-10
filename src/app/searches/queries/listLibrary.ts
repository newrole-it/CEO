import { resolver } from "@blitzjs/rpc"
import db from "db"
import { z } from "zod"

const PAGE_SIZE = 20

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(
    z.object({
      kind: z.enum(["interested", "rejected"]),
      page: z.number().int().min(1).optional().default(1),
    })
  ),
  async ({ kind, page }, ctx) => {
    const where = {
      savedSearch: { userId: ctx.session.userId! },
      ...(kind === "interested" ? { interestedAt: { not: null } } : { dismissedAt: { not: null } }),
    }
    const total = await db.jobMatch.count({ where })
    const matches = await db.jobMatch.findMany({
      where,
      orderBy: { lastEvaluatedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        job: { include: { company: true } },
        savedSearch: { select: { phrase: true, id: true } },
      },
    })
    return {
      kind,
      page,
      pageSize: PAGE_SIZE,
      total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      results: matches.map((match) => ({
        id: match.id,
        jobId: match.jobId,
        score: match.score,
        reason: match.reason,
        searchId: match.savedSearch.id,
        phrase: match.savedSearch.phrase,
        interestedAt: match.interestedAt,
        dismissedAt: match.dismissedAt,
        job: {
          title: match.job.title,
          company: match.job.company.name,
          locationText: match.job.locationText,
          originalUrl: match.job.originalUrl,
          workplaceType: match.job.workplaceType,
        },
      })),
    }
  }
)
