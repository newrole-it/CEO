"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { documentsForJob } from "src/server/cv/tailor"
import { optionalUser } from "src/app/users/guard"

/** The CV and letter already written for an offer; none for someone without a session. */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  async ({ jobId }, ctx) => {
    const userId = optionalUser(ctx.session)
    return userId ? documentsForJob(userId, jobId) : { cvId: null, letterId: null }
  }
)
