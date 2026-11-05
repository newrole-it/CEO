import { errorResponse, jsonResponse, preflight, withToken } from "src/server/autofill/http"
import { formLetterStatus } from "src/server/autofill/letter"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The cover letter fill started: pending, done with its text, or failed with the reason. */
export const GET = withToken(async (request, { userId }) => {
  const id = new URL(request.url).searchParams.get("id")?.trim().slice(0, 100)
  if (!id) return errorResponse(request, "The id parameter is required.", 400)
  const status = formLetterStatus(userId, id)
  if (!status) return errorResponse(request, "No such letter. Fill the form again.", 404)
  return jsonResponse(request, status)
})
