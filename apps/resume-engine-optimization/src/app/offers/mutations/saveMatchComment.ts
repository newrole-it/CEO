import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { COMMENT_MAX, MatchCommentKind } from "@newrole/cv-core/match"
import { saveMatchComment } from "src/server/cv/match-rounds"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "src/app/cv/guard"

/** The person's comment on one point of the newest round of a match; empty text takes it out. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      cvId: z.string().min(1).max(64),
      round: z.number().int().min(1),
      kind: MatchCommentKind,
      key: z.string().min(1).max(600),
      subject: z.string().max(600),
      text: z.string().max(COMMENT_MAX),
    })
  ),
  resolver.authorize(),
  async ({ cvId, ...input }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await saveMatchComment(userId, { documentId: cvId, ...input })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
