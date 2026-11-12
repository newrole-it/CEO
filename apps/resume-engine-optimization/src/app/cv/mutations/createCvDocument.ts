"use server"
import { resolver } from "src/server/rpc"
import { z } from "zod"
import { createCv } from "src/server/cv/service"
import { CvContent } from "@newrole/cv-core/schema"
import { userOrGuest } from "src/app/users/guard"
import { rethrowCv } from "../guard"

/** A new editable CV: blank template, from the profile, or from imported content. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      title: z.string().max(200).optional(),
      language: z.enum(["pl", "en"]).optional(),
      from: z.enum(["blank", "profile", "content"]),
      content: CvContent.optional(),
    })
  ),
  async (input, ctx) => {
    const userId = await userOrGuest(ctx.session)
    try {
      const cv = await createCv({ ...input, userId })
      return { id: cv.id }
    } catch (error) {
      rethrowCv(error)
    }
  }
)
