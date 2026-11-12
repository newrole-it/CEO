"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { createCvFromDescription } from "src/server/cv/describe"
import { userOrGuest } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** "Opisz swoje doświadczenie": a new editable CV the model writes from the person's description. */
export default resolver.pipe(
  resolver.zod(z.object({ text: z.string().max(20_000) })),
  async ({ text }, ctx) => {
    const userId = await userOrGuest(ctx.session)
    try {
      const { cv, reader } = await createCvFromDescription(userId, text)
      return { id: cv.id, reader }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
