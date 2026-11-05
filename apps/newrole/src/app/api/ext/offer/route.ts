import { z } from "zod"
import { assertOfferReadLimit } from "src/server/auth/magic-link"
import {
  errorResponse,
  jsonResponse,
  preflight,
  readJson,
  withToken,
} from "src/server/autofill/http"
import { addOfferByLink } from "src/server/offers/service"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

const Body = z.object({ url: z.string().trim().min(4).max(2000) })

/**
 * "Dodaj tę ofertę do newrole.it" in the extension's popup: the offer on the open tab, read whole and
 * kept for the person, as Add offer under Offers does (src/server/offers/service.ts). A page that
 * needs checking comes back as a draft; the extension then opens Offers with the link filled in.
 */
export const POST = withToken(async (request, { userId }) => {
  const { url } = await readJson(request, Body)
  try {
    await assertOfferReadLimit(userId)
  } catch (error) {
    return errorResponse(
      request,
      error instanceof Error ? error.message : "Too many links read.",
      429
    )
  }
  const check = await addOfferByLink(userId, url)
  if (check.kind === "added") {
    return jsonResponse(request, {
      kind: "added",
      jobId: check.jobId,
      company: check.company,
      title: check.title,
      added: check.added,
      textChars: check.textChars,
      path: `/offers/${check.jobId}`,
    })
  }
  if (check.kind === "draft") {
    // the page's text stays on the server; the person checks the draft in the app
    return jsonResponse(request, {
      kind: "draft",
      company: check.facts?.company ?? null,
      title: check.facts?.title ?? null,
      path: `/offers?add=${encodeURIComponent(check.url)}`,
    })
  }
  return jsonResponse(request, { kind: check.kind })
})
