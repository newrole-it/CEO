import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { requireMember } from "src/app/feedback/guard"
import { readOfferTextById } from "src/server/jobs/offer-text"

/** What the model will be able to read about an offer. The text itself stays on the server. */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  async ({ jobId }, ctx) => {
    requireMember(ctx.session)
    const read = await readOfferTextById(jobId)
    if (!read) throw new NotFoundError()
    return { origin: read.origin, chars: read.text.length }
  }
)
