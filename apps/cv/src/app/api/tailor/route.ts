import { z } from "zod"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { tailorForOffer } from "@/server/writing"

/** "Dostosuj CV" for an offer; again for the same offer adds a version. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(
    request,
    z.object({
      jobId: z.string().max(64),
      baseCvId: z.string().max(64).optional(),
      language: z.enum(["pl", "en"]).optional(),
      note: z.string().max(4000).optional(),
      locale: z.enum(["pl", "en"]).optional(),
    })
  )
  if (body instanceof Response) return body
  try {
    return Response.json(
      await tailorForOffer({
        offerId: body.jobId,
        baseId: body.baseCvId,
        language: body.language,
        note: body.note,
        locale: body.locale,
      })
    )
  } catch (error) {
    return errorResponse(error)
  }
}
