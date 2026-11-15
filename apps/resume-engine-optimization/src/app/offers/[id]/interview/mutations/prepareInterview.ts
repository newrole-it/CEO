"use server"
import { z } from "zod"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { prepareInterview } from "src/server/interview/prep"
import { InterviewError } from "src/server/interview/types"

const Input = z.object({ jobId: z.string().min(1).max(64) })

/**
 * Makes the interview preparation for one offer, in the person's interface language, and stores
 * it in place of the earlier one. A mutation because it can run the model for a few minutes and
 * must never be refetched on its own.
 */
export default resolver.pipe(resolver.zod(Input), async ({ jobId }, ctx) => {
  const userId = requireMember(ctx.session)
  try {
    return await prepareInterview(userId, jobId, { locale: await getLocale() })
  } catch (error) {
    if (error instanceof InterviewError && error.code === "job-not-found")
      throw new NotFoundError(error.message)
    throw error
  }
})
