import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(z.object({ id: z.string().min(1) })),
  async ({ id }, ctx) => {
    const search = await db.savedSearch.findFirst({
      where: { id, userId: ctx.session.userId! },
      include: { runs: { orderBy: { startedAt: "desc" }, take: 12 } },
    })
    if (!search) throw new NotFoundError("Search not found")
    const active = search.runs[0] ?? null
    const resultRun = search.runs.find((run) => run.status === "SUCCEEDED") ?? null
    const logRunId = active?.id
    const logs = logRunId
      ? await db.searchLog.findMany({
          where: { searchRunId: logRunId },
          orderBy: { createdAt: "asc" },
          take: 80,
        })
      : []
    const matches = resultRun
      ? await db.jobMatch.findMany({
          where: { searchRunId: resultRun.id },
          orderBy: { score: "desc" },
          include: { job: { include: { company: true } } },
        })
      : []

    return {
      search: {
        id: search.id,
        phrase: search.phrase,
        locationHint: search.locationHint,
        workMode: search.workMode,
        createdAt: search.createdAt,
      },
      active,
      resultRun,
      logs: logs.map((entry) => ({
        id: entry.id,
        level: entry.level,
        message: entry.message,
        createdAt: entry.createdAt,
      })),
      results: matches.map((match) => ({
        id: match.id,
        score: match.score,
        reason: match.reason,
        isNew: match.isNew,
        breakdown: match.scoreBreakdown,
        job: {
          id: match.job.id,
          title: match.job.title,
          company: match.job.company.name,
          locationText: match.job.locationText,
          workplaceType: match.job.workplaceType,
          employmentType: match.job.employmentType,
          salaryMin: match.job.salaryMin,
          salaryMax: match.job.salaryMax,
          salaryCurrency: match.job.salaryCurrency,
          publishedAt: match.job.publishedAt,
          firstSeenAt: match.job.firstSeenAt,
          sourceType: match.job.sourceType,
          summary: match.job.summary,
          descriptionText: match.job.descriptionText,
          originalUrl: match.job.originalUrl,
          status: match.job.status,
          variants: match.job.variants,
        },
      })),
    }
  }
)
