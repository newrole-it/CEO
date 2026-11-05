import { resolver } from "@blitzjs/rpc"
import db from "db"
import { indexableBoards } from "src/server/index/run"
import { readOfferSearchStats, type OfferSearchStats } from "src/server/discovery/offer-sync"
import { estimatePln, rollupLlmUsage, type LlmUsageRow } from "src/server/llm/prices"

export type OpsSnapshot = {
  companies: number
  openJobs: number
  catalog: number
  indexed: number
  pending: number
  complete: number
  tasks: {
    purpose: string
    calls: number
    tokenInput: number
    tokenOutput: number
    usd: number | null
    pln: number | null
  }[]
  totalUsd: number | null
  totalPln: number | null
  unpriced: boolean
  recordedCalls: number
  searchRuns: number
  searchTokenInput: number
  searchTokenOutput: number
  searchStoredUsd: number
  offerSearch: OfferSearchStats
}

/** Admin-only picture of coverage and model spend. Numbers come from stored rows, not estimates of work that never ran. */
export default resolver.pipe(resolver.authorize("ADMIN"), async () => {
  const boards = indexableBoards()
  const [companies, openJobs, pages, grouped, runs, offerSearch] = await Promise.all([
    db.company.count(),
    db.job.count({ where: { status: { in: ["ACTIVE", "POSSIBLY_CLOSED"] } } }),
    db.careerPage.findMany({
      select: {
        provider: true,
        providerBoardId: true,
        lastSuccessfulFetchAt: true,
        indexComplete: true,
      },
    }),
    db.llmCache.groupBy({
      by: ["purpose", "model"],
      _sum: { tokenInput: true, tokenOutput: true },
      _count: { _all: true },
    }),
    db.searchRun.aggregate({
      _count: { _all: true },
      _sum: { tokenInput: true, tokenOutput: true, estimatedCost: true },
    }),
    readOfferSearchStats(),
  ])
  const byKey = new Map(
    pages
      .filter((page) => page.providerBoardId)
      .map((page) => [`${page.provider}:${page.providerBoardId}`, page])
  )
  let indexed = 0
  let pending = 0
  let complete = 0
  for (const board of boards) {
    const page = byKey.get(`${board.provider}:${board.boardId}`)
    if (page?.lastSuccessfulFetchAt) {
      indexed += 1
      if (page.indexComplete) complete += 1
    } else pending += 1
  }
  const rows: LlmUsageRow[] = grouped.map((row) => ({
    purpose: row.purpose,
    model: row.model,
    calls: row._count._all,
    tokenInput: row._sum.tokenInput ?? 0,
    tokenOutput: row._sum.tokenOutput ?? 0,
  }))
  const usage = rollupLlmUsage(rows)
  const snapshot: OpsSnapshot = {
    companies,
    openJobs,
    catalog: boards.length,
    indexed,
    pending,
    complete,
    tasks: usage.tasks.map((task) => ({
      ...task,
      pln: task.usd == null ? null : estimatePln(task.usd),
    })),
    totalUsd: usage.totalUsd,
    totalPln: usage.totalUsd == null ? null : estimatePln(usage.totalUsd),
    unpriced: usage.unpriced,
    recordedCalls: rows.reduce((sum, row) => sum + row.calls, 0),
    searchRuns: runs._count._all,
    searchTokenInput: runs._sum.tokenInput ?? 0,
    searchTokenOutput: runs._sum.tokenOutput ?? 0,
    searchStoredUsd: runs._sum.estimatedCost ?? 0,
    offerSearch,
  }
  return snapshot
})
