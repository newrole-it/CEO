"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { readProgress } from "src/server/cv/tailor-progress"
import { RunId } from "../run-id"

/**
 * The steps a run of "Dostosuj CV" has reported so far, for the page that waits for it. Null when
 * this server has not seen the run.
 */
export default resolver.pipe(resolver.zod(z.object({ runId: RunId })), async ({ runId }, ctx) => {
  const userId = requireMember(ctx.session)
  return readProgress(userId, runId)
})
