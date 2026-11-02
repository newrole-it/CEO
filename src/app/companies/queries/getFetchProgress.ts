import { resolver } from "@blitzjs/rpc"
import db from "db"
import { buildFetchProgress, type FetchBoard } from "src/server/index/progress"
import { indexableBoards } from "src/server/index/run"
import { isLocalInstall } from "src/server/local-install"
import { isIndexablePage } from "src/server/watchlist/index-watched"

/**
 * What the worker reads for this person: the seed catalog plus their own watched companies.
 * Companies only other people watch stay out, so their names never show up here.
 */
export default resolver.pipe(resolver.authorize(), async (_input: unknown, ctx) => {
  const [pages, watches, offers, activeSearches, heartbeat] = await Promise.all([
    db.careerPage.findMany({
      select: {
        companyId: true,
        provider: true,
        providerBoardId: true,
        enabled: true,
        lastSuccessfulFetchAt: true,
        lastCheckedAt: true,
        nextCheckAt: true,
        indexComplete: true,
        lastErrorCode: true,
        fetchNote: true,
        company: { select: { name: true } },
      },
    }),
    db.watchedCompany.findMany({
      where: { userId: ctx.session.userId! },
      select: { companyId: true },
    }),
    db.job.count({ where: { status: "ACTIVE" } }),
    db.backgroundTask.count({
      where: { type: "RUN_SEARCH", status: { in: ["PENDING", "RUNNING"] } },
    }),
    db.serviceHeartbeat.findUnique({ where: { service: "worker" } }),
  ])

  const mine = new Set(watches.map((watch) => watch.companyId))
  const byKey = new Map(
    pages
      .filter((page) => page.providerBoardId)
      .map((page) => [`${page.provider}:${page.providerBoardId}`, page])
  )
  const toBoard = (page: (typeof pages)[number] | undefined, company: string): FetchBoard => ({
    company: page?.company.name || company,
    lastSuccessfulFetchAt: page?.lastSuccessfulFetchAt ?? null,
    lastCheckedAt: page?.lastCheckedAt ?? null,
    nextCheckAt: page?.nextCheckAt ?? null,
    indexComplete: page?.indexComplete ?? false,
    lastErrorCode: page?.lastErrorCode ?? null,
    fetchNote: page?.fetchNote ?? null,
    watchedCompanyId: page && mine.has(page.companyId) ? page.companyId : null,
  })
  const seeds = indexableBoards()
  const seedKeys = new Set(seeds.map((seed) => `${seed.provider}:${seed.boardId}`))
  const boards = [
    ...seeds.map((seed) => toBoard(byKey.get(`${seed.provider}:${seed.boardId}`), seed.companyName)),
    ...pages
      .filter(
        (page) =>
          mine.has(page.companyId) &&
          isIndexablePage(page) &&
          !seedKeys.has(`${page.provider}:${page.providerBoardId}`)
      )
      .map((page) => toBoard(page, page.company.name)),
  ]

  return {
    ...buildFetchProgress({
      now: new Date(),
      boards,
      activeSearches,
      workerSeenAt: heartbeat?.lastSeenAt ?? null,
    }),
    offers,
    // Only on the person's own machine is there a terminal to start the worker from.
    local: isLocalInstall(),
  }
})
