import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { generateLetterForJob } from "src/server/cv/tailor"
import { requireMember } from "src/app/feedback/guard"
import { rethrowCv } from "../guard"

/** The cover letter for an offer: a new document, or a new version of the one it already has. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      jobId: z.string().min(1).max(64),
      language: z.enum(["pl", "en"]).optional(),
      note: z.string().max(4000).optional(),
    })
  ),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await generateLetterForJob({ ...input, userId })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
