import { resolver } from "@blitzjs/rpc"
import db from "db"
import { indexableBoards } from "src/server/index/run"
import { buildCrawlSnapshot, type ProgressBoard } from "src/server/index/progress"

export default resolver.pipe(resolver.authorize("ADMIN"), async () => {
  const now = new Date()
  const seeds = indexableBoards()
  const [pages, jobs, activeSearches] = await Promise.all([
    db.careerPage.findMany({
      select: {
        provider: true,
        providerBoardId: true,
        lastSuccessfulFetchAt: true,
        lastCheckedAt: true,
        nextCheckAt: true,
        indexComplete: true,
        lastErrorCode: true,
        fetchNote: true,
        company: { select: { name: true } },
        _count: { select: { jobs: { where: { status: "ACTIVE" } } } },
      },
    }),
    db.job.count({ where: { status: "ACTIVE" } }),
    db.backgroundTask.count({
      where: { type: "RUN_SEARCH", status: { in: ["PENDING", "RUNNING"] } },
    }),
  ])
  const byKey = new Map(
    pages
      .filter((page) => page.providerBoardId)
      .map((page) => [`${page.provider}:${page.providerBoardId}`, page])
  )
  const boards: ProgressBoard[] = seeds.map((seed) => {
    const page = byKey.get(`${seed.provider}:${seed.boardId}`)
    return {
      company: page?.company.name || seed.companyName,
      provider: seed.provider,
      boardId: seed.boardId,
      lastSuccessfulFetchAt: page?.lastSuccessfulFetchAt ?? null,
      lastCheckedAt: page?.lastCheckedAt ?? null,
      nextCheckAt: page?.nextCheckAt ?? null,
      indexComplete: page?.indexComplete ?? false,
      lastErrorCode: page?.lastErrorCode ?? null,
      fetchNote: page?.fetchNote ?? null,
      jobs: page?._count.jobs ?? 0,
    }
  })
  return { jobs, ...buildCrawlSnapshot({ now, boards, activeSearches }) }
})
