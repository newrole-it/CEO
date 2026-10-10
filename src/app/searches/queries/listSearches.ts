import {resolver} from "@blitzjs/rpc"
import db from "db"

export default resolver.pipe(resolver.authorize(), async (_input: null, ctx) => {
  const searches = await db.savedSearch.findMany({
    where: {userId: ctx.session.userId!, isActive: true},
    orderBy: {createdAt: "desc"},
    take: 30,
    include: {
      runs: {
        orderBy: {startedAt: "desc"},
        take: 1,
        select: {id: true, status: true, matchedJobs: true, newJobs: true, startedAt: true, message: true},
      },
    },
  })
  return searches.map((search) => ({
    id: search.id,
    phrase: search.phrase,
    locationHint: search.locationHint,
    workMode: search.workMode,
    createdAt: search.createdAt,
    latest: search.runs[0] ?? null,
  }))
})
