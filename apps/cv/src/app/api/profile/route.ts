import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { saveDraft } from "@/server/profile"
import { z } from "zod"

/** Saves the profile the person reviewed (@newrole/profile/schema checks it). */
export async function PUT(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(request, z.unknown())
  if (body instanceof Response) return body
  try {
    return Response.json({ draft: await saveDraft(body) })
  } catch (error) {
    return errorResponse(error)
  }
}
