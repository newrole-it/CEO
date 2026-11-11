import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { answerTailorProposal } from "src/server/cv/proposals"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Dodaj" or "Pomiń" on an addition tailoring proposed. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      proposalId: z.string().min(1).max(64),
      answer: z.enum(["add", "skip"]),
    })
  ),
  async ({ id, proposalId, answer }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await answerTailorProposal(userId, id, proposalId, answer)
    } catch (error) {
      rethrowCv(error)
    }
  }
)
