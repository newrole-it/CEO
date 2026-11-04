import { failure, refuseForeignHost } from "@/server/http"
import { offerText } from "@/server/offers"
import { getOffer } from "@/server/store"

/** How much of the offer the model will read. The text itself stays on the server. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const offer = await getOffer((await params).id)
  if (!offer) return failure("not-found", "Offer not found.", 404)
  const read = await offerText(offer)
  return Response.json({ origin: read.origin, chars: read.text.length })
}
