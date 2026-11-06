import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { RunId } from "../run-id"
import { generateLetterForJob } from "src/server/cv/tailor"
import { progressReporter } from "src/server/cv/tailor-progress"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** The cover letter for an offer: a new document, or a new version of the one it already has. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      language: z.enum(["pl", "en"]).optional(),
      note: z.string().max(4000).optional(),
      /** Names this run for getTailorProgress; the CV's run when the letter follows it */
      runId: RunId.optional(),
    })
  ),
  async ({ runId, ...input }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await generateLetterForJob({
        ...input,
        userId,
        onStep: progressReporter(userId, runId),
      })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
