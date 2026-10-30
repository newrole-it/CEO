import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { ApplicantInfoSchema } from "src/shared/applicant"
import { saveApplicant } from "src/server/profile/applicant"

export default resolver.pipe(resolver.zod(ApplicantInfoSchema), async (input, ctx) => {
  const userId = requireMember(ctx.session)
  return saveApplicant(userId, input)
})
