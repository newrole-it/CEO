import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { listWatched } from "src/server/watchlist/watch"

/** The watchlist; `since` (ms) counts offers first seen after the previous visit. */
export default resolver.pipe(
  resolver.zod(z.object({ since: z.number().int().positive().optional() })),
  resolver.authorize(),
  async ({ since }, ctx) => {
    return listWatched(ctx.session.userId!, { since: since ? new Date(since) : undefined })
  }
)
