import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { feedbackPrompt } from "src/server/preferences/prompt"
import { optionalUser } from "../guard"
import { LocaleInput } from "../schema"

/**
 * Chips for "Co Ci się podoba?" / "Dlaczego nie?". Works without a session (tags from the
 * offer only); with one, aspects matching the profile or the saved answer are preselected.
 */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64), locale: LocaleInput })),
  async ({ jobId, locale }, ctx) => {
    return feedbackPrompt(jobId, optionalUser(ctx.session) ?? undefined, { locale })
  }
)
