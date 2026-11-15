"use server"
import { z } from "zod"
import { RunId } from "src/app/cv/run-id"
import { requireMember } from "src/app/users/guard"
import { progressReporter } from "src/server/cv/tailor-progress"
import { evaluateOffer, EvaluationError } from "src/server/evaluation/service"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"

/**
 * "Oceń ofertę" on /offers/[id]/evaluation: evaluates the offer against the person's general CV
 * and profile (src/server/evaluation/service.ts) and keeps the result in place of the one before.
 * `locale` is the interface language, for the model's notes. The run's steps are read with
 * getTailorProgress, as tailoring's are.
 */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      locale: z.enum(["pl", "en"]),
      /** Names this run for getTailorProgress */
      runId: RunId.optional(),
    })
  ),
  resolver.authorize(),
  async ({ jobId, locale, runId }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const view = await evaluateOffer(userId, jobId, {
        locale,
        onStep: progressReporter(userId, runId),
      })
      return { decision: view.evaluation.decision, score: view.evaluation.score }
    } catch (error) {
      if (error instanceof EvaluationError) throw new NotFoundError(error.code)
      throw error
    }
  }
)
