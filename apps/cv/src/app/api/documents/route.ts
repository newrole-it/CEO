import { z } from "zod"
import { CvContent } from "@newrole/cv-core/schema"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { createDocument } from "@/server/store"
import { cvFromMyProfile } from "@/server/profile"
import { blankDocument } from "@/server/writing"

/** A new CV: empty in the layout, from the profile, or content the page has (an imported HTML CV). */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(
    request,
    z.union([
      z.object({ from: z.literal("blank"), language: z.enum(["pl", "en"]) }),
      z.object({ from: z.literal("profile"), language: z.enum(["pl", "en"]) }),
      z.object({
        from: z.literal("content"),
        title: z.string().max(200),
        language: z.enum(["pl", "en"]),
        content: CvContent,
      }),
    ])
  )
  if (body instanceof Response) return body
  try {
    const document =
      body.from === "blank"
        ? await blankDocument(body.language)
        : body.from === "profile"
        ? await cvFromMyProfile(body.language)
        : await createDocument(body)
    return Response.json({ id: document.id })
  } catch (error) {
    return errorResponse(error)
  }
}
