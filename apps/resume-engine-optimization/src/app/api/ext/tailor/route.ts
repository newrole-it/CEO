import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import {
  errorResponse,
  jsonResponse,
  preflight,
  readJson,
  withToken,
} from "src/server/autofill/http"
import { offerFit, startQuickTailor } from "src/server/offers/quick-tailor"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

const Body = z.object({
  url: z.string().trim().min(4).max(2000),
  /** The extension's interface language, for the notes the run writes for the person */
  locale: z.enum(["pl", "en"]),
})

/**
 * The panel on an open offer (apps/reo-extension/lib/offer-notice.js) asks whether the offer is
 * the person's, for the match of the CV written for it and for the steps of a run that is going.
 * `jobId` is what POST answered with: an address the index does not find again still gets its run.
 */
export const GET = withToken(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const url = params.get("url")?.trim().slice(0, 2000)
  if (!url) return errorResponse(request, "The url parameter is required.", 400)
  const jobId = params.get("jobId")?.trim().slice(0, 64) || null
  return jsonResponse(request, await offerFit(userId, { url, jobId }))
})

/**
 * "Dopasuj CV" in the extension: the offer on the open tab is added to the person's and tailoring
 * starts for it (src/server/offers/quick-tailor.ts). Answers at once with a code; GET follows the
 * run.
 */
export const POST = withToken(async (request, { userId }) => {
  const { url, locale } = await readJson(request, Body)
  try {
    await assertOfferReadLimit(userId)
  } catch {
    return jsonResponse(request, { kind: "limited" })
  }
  return jsonResponse(request, await startQuickTailor({ userId, url, locale }))
})
