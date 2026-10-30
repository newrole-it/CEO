import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { getApplicant } from "src/server/profile/applicant"

/** Form details the extension fills: what was saved, and the defaults shown as placeholders. */
export default resolver.pipe(async (_input: null, ctx) => {
  const userId = requireMember(ctx.session)
  return getApplicant(userId)
})
