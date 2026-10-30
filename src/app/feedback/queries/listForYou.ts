import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { listForYou } from "src/server/jobs/browse"
import { optionalUser } from "../guard"
import { BrowseFilterInput, LocaleInput } from "../schema"

/**
 * "Dla Ciebie", page by page, with the same filters as /jobs. Needs a profile or some
 * feedback (hasProfile / hasFeedback say which); otherwise returns an empty page.
 */
export default resolver.pipe(
  resolver.zod(
    BrowseFilterInput.extend({
      page: z.number().int().min(1).max(50).optional(),
      locale: LocaleInput,
    })
  ),
  async ({ locale, ...input }, ctx) => {
    return listForYou(input, optionalUser(ctx.session), locale ?? "pl")
  }
)
