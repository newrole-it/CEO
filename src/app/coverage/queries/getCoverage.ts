import { resolver } from "@blitzjs/rpc"
import { coverageRows } from "config/source-policies"
import db from "db"

const OPEN = ["ACTIVE", "POSSIBLY_CLOSED"] as const

export default resolver.pipe(resolver.authorize(), async () => {
  const [totalJobs, pages] = await Promise.all([
    db.job.count({ where: { status: { in: [...OPEN] } } }),
    db.careerPage.findMany({
      include: {
        _count: { select: { jobs: { where: { status: { in: [...OPEN] } } } } },
      },
    }),
  ])
  const rows = coverageRows().map((row) => {
    const page = row.boardId
      ? pages.find((item) => item.providerBoardId === row.boardId)
      : undefined
    const crawled = Boolean(page?.lastSuccessfulFetchAt)
    const incomplete = row.policy !== "link_only" && (!crawled || page?.indexComplete === false)
    return {
      employer: row.employer,
      platform: row.platform,
      policy: row.policy,
      reason: row.reason,
      termsUrl: row.termsUrl,
      href: row.href ?? null,
      lastFetch: page?.lastSuccessfulFetchAt ?? null,
      nextFetch: page?.nextCheckAt ?? null,
      jobCount: page?._count.jobs ?? 0,
      listedCount: page?.listedCount ?? 0,
      indexComplete: page?.indexComplete ?? false,
      incomplete,
      note: page?.fetchNote ?? null,
    }
  })
  return {
    totalJobs,
    incompleteEmployers: rows.filter((row) => row.incomplete).length,
    rows,
  }
})
