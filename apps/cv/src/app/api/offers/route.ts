import { z } from "zod"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { addOfferByHand, addOfferFromLink } from "@/server/offers"

/** An offer from its link (read politely), or named by hand when its site may not be read. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(
    request,
    z.union([
      z.object({ url: z.string().trim().url().max(2000) }),
      z.object({
        company: z.string().trim().min(1).max(160),
        title: z.string().trim().min(1).max(200),
        location: z.string().trim().max(200).optional(),
      }),
    ])
  )
  if (body instanceof Response) return body
  try {
    const offer = "url" in body ? await addOfferFromLink(body.url) : await addOfferByHand(body)
    return Response.json(offer)
  } catch (error) {
    return errorResponse(error)
  }
}
