import { findApplicationByUrl } from "src/server/applications/service"
import { errorResponse, jsonResponse, preflight, withToken } from "src/server/autofill/http"
import { normalizePostingUrl } from "src/server/autofill/job-extract"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const GET = withToken(async (request, { userId }) => {
  const url = new URL(request.url).searchParams.get("url")?.trim()
  if (!url) return errorResponse(request, "The url parameter is required.", 400)
  const application = await findApplicationByUrl(userId, normalizePostingUrl(url))
  return jsonResponse(request, {
    applied: application
      ? { id: application.id, status: application.status, appliedAt: application.appliedAt }
      : null,
  })
})
