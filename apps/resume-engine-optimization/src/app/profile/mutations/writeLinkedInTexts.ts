"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { rethrowCv } from "src/app/cv/guard"
import { requireMember } from "src/app/users/guard"
import { linkedInTextsFor } from "src/server/profile/linkedin-sync"

/** "Przygotuj teksty na LinkedIn": headline, About, roles and skills from the default CV. */
export default resolver.pipe(
  resolver.zod(z.object({ language: z.enum(["pl", "en"]).optional() })),
  async (input, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      return await linkedInTextsFor({ userId, language: input.language })
    } catch (error) {
      rethrowCv(error)
    }
  }
)
