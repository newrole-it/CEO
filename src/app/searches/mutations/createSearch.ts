import { resolver } from "@blitzjs/rpc"
import db from "db"
import { createGuestUser } from "src/server/auth/accounts"
import { enqueueSearch } from "src/server/queue/enqueue"
import { createSearchInputSchema } from "src/shared/schemas"

export default resolver.pipe(resolver.zod(createSearchInputSchema), async (input, ctx) => {
  let userId = ctx.session.userId
  if (!userId) {
    const guest = await createGuestUser()
    await ctx.session.$create({ userId: guest.id, role: "GUEST" })
    userId = guest.id
  }
  return db.$transaction(async (tx) => {
    const search = await tx.savedSearch.create({
      data: {
        userId,
        name: input.phrase.slice(0, 80),
        phrase: input.phrase,
        locationHint: input.locationHint,
        workMode: input.workMode,
        targetTitles: [],
        includedKeywords: [],
        excludedKeywords: [],
        seniority: [],
      },
    })
    const run = await tx.searchRun.create({
      data: {
        savedSearchId: search.id,
        status: "QUEUED",
        phase: "queued",
        progress: 2,
        message: "Queued",
      },
    })
    await enqueueSearch(run.id, tx)
    await tx.auditEvent.create({
      data: {
        userId,
        action: "SEARCH_CREATED",
        metadata: { searchId: search.id, phrase: input.phrase },
      },
    })
    return { searchId: search.id, searchRunId: run.id }
  })
})
