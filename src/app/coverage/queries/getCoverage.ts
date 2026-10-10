import { resolver } from "@blitzjs/rpc"
import { coverageRows } from "config/source-policies"
import db from "db"

export default resolver.pipe(resolver.authorize(), async () => {
  const pages = await db.careerPage.findMany({
    include: { _count: { select: { jobs: true } } },
  })
  return coverageRows().map((row) => {
    const page = row.boardId
      ? pages.find((item) => item.providerBoardId === row.boardId)
      : undefined
    return {
      employer: row.employer,
      platform: row.platform,
      policy: row.policy,
      reason: row.reason,
      termsUrl: row.termsUrl,
      href: row.href ?? null,
      lastFetch: page?.lastCheckedAt ?? null,
      jobCount: page?._count.jobs ?? 0,
      note: page?.fetchNote ?? null,
    }
  })
})
