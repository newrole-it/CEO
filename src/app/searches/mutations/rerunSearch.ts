import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import db from "db"
import { z } from "zod"
import { enqueueSearch } from "src/server/queue/enqueue"

const ACTIVE = ["QUEUED", "RUNNING", "RETRYING"] as const

export default resolver.pipe(
  resolver.authorize(),
  resolver.zod(z.object({ id: z.string().min(1) })),
  async ({ id }, ctx) => {
    const search = await db.savedSearch.findFirst({ where: { id, userId: ctx.session.userId! } })
    if (!search) throw new NotFoundError("Search not found")
    return db.$transaction(async (tx) => {
      const active = await tx.searchRun.findFirst({
        where: { savedSearchId: id, status: { in: [...ACTIVE] } },
        orderBy: { startedAt: "desc" },
      })
      if (active) return { searchId: id, searchRunId: active.id, alreadyRunning: true }
      const run = await tx.searchRun.create({
        data: {
          savedSearchId: id,
          status: "QUEUED",
          phase: "queued",
          progress: 2,
          message: "Queued for a fresh scan",
        },
      })
      await enqueueSearch(run.id, tx)
      await tx.auditEvent.create({
        data: {
          userId: ctx.session.userId,
          action: "SEARCH_RERUN",
          metadata: { searchId: id, searchRunId: run.id },
        },
      })
      return { searchId: id, searchRunId: run.id, alreadyRunning: false }
    })
  }
)
