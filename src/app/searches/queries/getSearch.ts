import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"
import { seniorityAffinity } from "src/server/classify/role"
import { techScopeWhere } from "src/server/classify/scope"
import { seniorityValues } from "src/server/profile/schema"
import { rejectionPenalty } from "src/server/search/feedback"
import { profileReady, takeShortlist } from "src/shared/shortlist"

const input = z.object({
  id: z.string().min(1),
  page: z.number().int().min(1).optional().default(1),
  location: z.string().trim().max(80).optional(),
  company: z.string().trim().max(80).optional(),
  remote: z.boolean().optional(),
  salary: z.boolean().optional(),
  contract: z.string().trim().max(40).optional(),
  includeDismissed: z.boolean().optional(),
  includeDecided: z.boolean().optional(),
  industry: z.string().trim().max(40).optional(),
  minSalary: z.number().positive().max(1_000_000).optional(),
  seniority: z.enum(seniorityValues).optional(),
  full: z.boolean().optional(),
})

const PAGE_SIZE = 20

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(input),
  async (
    {
      id,
      page,
      location,
      company,
      remote,
      salary,
      contract,
      includeDismissed,
      includeDecided,
      industry,
      minSalary,
      seniority,
      full,
    },
    ctx
  ) => {
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
      ...(seniority ? { seniorityLevel: seniority } : {}),
    }
    const showDecided = Boolean(includeDecided || includeDismissed)
    const where = {
      searchRunId: matchRun?.id ?? "__none__",
      ...(showDecided ? {} : { dismissedAt: null, interestedAt: null }),
      ...(industry ? { fitIndustry: { contains: industry, mode: "insensitive" as const } } : {}),
      ...(minSalary != null ? { fitSalaryMonthly: { gte: minSalary } } : {}),
      job: { AND: [techScopeWhere(), jobWhere] },
    }
    const viewer = await db.user.findUnique({
      where: { id: ctx.session.userId! },
      select: { role: true },
    })
    const profile = await db.candidateProfile.findUnique({
      where: { userId: ctx.session.userId! },
      select: {
        id: true,
        seniority: true,
        headline: true,
        currentTitle: true,
        linkedinImportedAt: true,
      },
    })
    const ready = profileReady(profile)
    const rejected = await db.jobMatch.findMany({
      where: { dismissedAt: { not: null }, savedSearch: { userId: ctx.session.userId! } },
      orderBy: { dismissedAt: "desc" },
      take: 40,
      select: {
        jobId: true,
        job: { select: { title: true, company: { select: { name: true } } } },
      },
    })
    const rejectedOffers = rejected.map((row) => ({
      jobId: row.jobId,
      title: row.job.title,
      company: row.job.company.name,
    }))
    const light = matchRun
      ? await db.jobMatch.findMany({
          where,
          select: {
            id: true,
            score: true,
            jobId: true,
            job: {
              select: {
                title: true,
                seniorityLevel: true,
                company: { select: { name: true } },
              },
            },
          },
        })
      : []
    const ordered = light
      .map((row) => {
        const penalty = rejectionPenalty(
          { title: row.job.title, company: row.job.company.name },
          rejectedOffers.filter((item) => item.jobId !== row.jobId)
        )
        const affinity = seniorityAffinity(profile?.seniority, row.job.seniorityLevel)
        const delta = penalty + affinity
        return { id: row.id, score: row.score, delta, rank: row.score + delta }
      })
      .sort((a, b) => b.rank - a.rank || b.score - a.score || a.id.localeCompare(b.id))
    const listed = takeShortlist(ordered, ready, Boolean(full))
    const viewPage = listed.shortlisted ? 1 : page
    const total = listed.rows.length
    const pageIds = listed.rows.slice((viewPage - 1) * PAGE_SIZE, viewPage * PAGE_SIZE)
    const deltaById = new Map(pageIds.map((row) => [row.id, row.delta]))
    const loaded = pageIds.length
      ? await db.jobMatch.findMany({
          where: { id: { in: pageIds.map((row) => row.id) } },
          include: { job: { include: { company: true } } },
        })
      : []
    const byId = new Map(loaded.map((match) => [match.id, match]))
    const matches = pageIds.flatMap((row) => {
      const match = byId.get(row.id)
      return match ? [match] : []
    })
    const hiddenDecided = matchRun
      ? await db.jobMatch.count({
          where: {
            searchRunId: matchRun.id,
            OR: [{ dismissedAt: { not: null } }, { interestedAt: { not: null } }],
          },
        })
      : 0
    const sample = matchRun
      ? await db.jobMatch.findFirst({
          where: { searchRunId: matchRun.id },
          select: { scoreBreakdown: true },
        })
      : null
    const breakdown = sample?.scoreBreakdown
    const personalized = Boolean(
      breakdown &&
        typeof breakdown === "object" &&
        !Array.isArray(breakdown) &&
        "profile" in breakdown
    )

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
      page: viewPage,
      pageSize: PAGE_SIZE,
      total,
      matchTotal: ordered.length,
      pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      shortlisted: listed.shortlisted,
      hasProfile: ready,
      personalized,
      signedIn: Boolean(viewer && viewer.role !== "GUEST"),
      hiddenDecided,
      results: matches.map((match) => ({
        id: match.id,
        score: match.score,
        feedbackDelta: deltaById.get(match.id) ?? 0,
        reason: match.reason,
        isNew: match.isNew,
        seenAt: match.seenAt,
        dismissedAt: match.dismissedAt,
        interestedAt: match.interestedAt,
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
