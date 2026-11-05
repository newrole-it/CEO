import {
  errorResponse,
  jsonResponse,
  preflight,
  readJson,
  withToken,
} from "src/server/autofill/http"
import { applyOpenedMail, ApplyMailSchema } from "src/server/gmail/opened"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The person confirmed in the popup: the message goes on that application's timeline. */
export const POST = withToken(async (request, { userId }) => {
  const body = await readJson(request, ApplyMailSchema)
  const result = await applyOpenedMail(userId, body)
  if (result.status === "used") return errorResponse(request, "already-used", 409)
  return jsonResponse(request, { application: result.application, changed: result.changed })
})
