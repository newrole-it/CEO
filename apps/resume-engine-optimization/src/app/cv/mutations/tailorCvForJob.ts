import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { RunId } from "../run-id"
import { tailorCvForJob } from "src/server/cv/tailor"
import { progressReporter } from "src/server/cv/tailor-progress"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Dostosuj CV": a new CV written for the offer, or a new version of the one it already has. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      baseCvId: z.string().min(1).max(64).optional(),
      language: z.enum(["pl", "en"]).optional(),
      note: z.string().max(4000).optional(),
      locale: z.enum(["pl", "en"]).optional(),
      /** Names this run for getTailorProgress */
      runId: RunId.optional(),
    })
  ),
  async ({ runId, ...input }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await tailorCvForJob({ ...input, userId, onStep: progressReporter(userId, runId) })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
