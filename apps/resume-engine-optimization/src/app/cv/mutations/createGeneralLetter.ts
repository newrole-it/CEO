"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { createGeneralLetter } from "src/server/cv/service"
import { writeGeneralLetterForCv } from "src/server/cv/tailor"
import { requireMember } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** The general letter of a general CV: written by the model, from pasted text, or blank. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      cvId: z.string().min(1).max(64),
      from: z.enum(["write", "text", "blank"]),
      text: z.string().max(20_000).optional(),
    })
  ),
  async ({ cvId, from, text }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const letter =
        from === "write"
          ? await writeGeneralLetterForCv({ userId, cvId })
          : await createGeneralLetter({ userId, cvId, from, text })
      return { id: letter.id }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
