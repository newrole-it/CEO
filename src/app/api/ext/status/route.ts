import { offerStatus } from "src/server/applications/offer-status"
import { errorResponse, jsonResponse, preflight, withToken } from "src/server/autofill/http"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const GET = withToken(async (request, { userId }) => {
  const params = new URL(request.url).searchParams
  const url = params.get("url")?.trim()
  if (!url) return errorResponse(request, "The url parameter is required.", 400)
  const fact = (name: string) => params.get(name)?.trim().slice(0, 300) || null
  return jsonResponse(
    request,
    await offerStatus(userId, {
      url,
      company: fact("company"),
      title: fact("title"),
      pageTitle: fact("pageTitle"),
      siteName: fact("siteName"),
    })
  )
})
