import { z } from "zod"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { auditProfile } from "@/server/profile"

/** Audits the imported profile: a score, what to change and why. Calls the model when there is one. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(request, z.object({ locale: z.enum(["pl", "en"]) }))
  if (body instanceof Response) return body
  try {
    return Response.json(await auditProfile(body.locale))
  } catch (error) {
    return errorResponse(error)
  }
}
