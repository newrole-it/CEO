import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"

const input = z.object({
  id: z.string().min(1),
  page: z.number().int().min(1).optional().default(1),
  location: z.string().trim().max(80).optional(),
  company: z.string().trim().max(80).optional(),
  remote: z.boolean().optional(),
  salary: z.boolean().optional(),
  contract: z.string().trim().max(40).optional(),
  includeDismissed: z.boolean().optional(),
})

const PAGE_SIZE = 20

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(input),
  async ({ id, page, location, company, remote, salary, contract, includeDismissed }, ctx) => {
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
    const matchRun =
      active && (active.matchedJobs > 0 || active.status === "SUCCEEDED") ? active : resultRun
    const jobWhere = {
      ...(location ? { locationText: { contains: location, mode: "insensitive" as const } } : {}),
      ...(company
        ? { company: { name: { contains: company, mode: "insensitive" as const } } }
        : {}),
      ...(remote ? { workplaceType: "REMOTE" as const } : {}),
      ...(contract ? { employmentType: { contains: contract, mode: "insensitive" as const } } : {}),
      ...(salary ? { OR: [{ salaryMin: { not: null } }, { salaryMax: { not: null } }] } : {}),
    }
    const where = {
      searchRunId: matchRun?.id ?? "__none__",
      ...(includeDismissed ? {} : { dismissedAt: null }),
      ...(Object.keys(jobWhere).length ? { job: jobWhere } : {}),
    }
    const total = matchRun ? await db.jobMatch.count({ where }) : 0
    const matches = matchRun
      ? await db.jobMatch.findMany({
          where,
          orderBy: { score: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
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
      page,
      pageSize: PAGE_SIZE,
      total,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      results: matches.map((match) => ({
        id: match.id,
        score: match.score,
        reason: match.reason,
        isNew: match.isNew,
        seenAt: match.seenAt,
        dismissedAt: match.dismissedAt,
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
