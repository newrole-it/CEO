import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { nextMatchRound } from "src/server/cv/tailor"
import { progressReporter } from "src/server/cv/tailor-progress"
import { requireMember } from "src/app/users/guard"
import { RunId } from "src/app/cv/run-id"
import { rethrowCv } from "src/app/cv/guard"

/**
 * "Popraw CV i sprawdź ponownie" on the match dashboard: the newest round's comments become the
 * person's facts and the next round runs; `rewrite` false only checks the CV again, `fresh`
 * writes it anew from the general CV it was tailored from.
 */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      rewrite: z.boolean(),
      fresh: z.boolean().optional(),
      locale: z.enum(["pl", "en"]).optional(),
      /** Names this run for getTailorProgress */
      runId: RunId.optional(),
    })
  ),
  resolver.authorize(),
  async ({ runId, ...input }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const result = await nextMatchRound({
        ...input,
        userId,
        onStep: progressReporter(userId, runId),
      })
      return { id: result.id, round: result.round }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
