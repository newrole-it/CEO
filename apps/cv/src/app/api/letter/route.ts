import { z } from "zod"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { letterForOffer } from "@/server/writing"

/** The cover letter for an offer; again adds a version. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(
    request,
    z.object({
      jobId: z.string().max(64),
      language: z.enum(["pl", "en"]).optional(),
      note: z.string().max(4000).optional(),
    })
  )
  if (body instanceof Response) return body
  try {
    return Response.json(
      await letterForOffer({ offerId: body.jobId, language: body.language, note: body.note })
    )
  } catch (error) {
    return errorResponse(error)
  }
}
