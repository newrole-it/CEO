import { fillForm } from "src/server/autofill/fill"
import {
  FillBodySchema,
  jsonResponse,
  preflight,
  readJson,
  withToken,
} from "src/server/autofill/http"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const POST = withToken(async (request, { userId }) => {
  const body = await readJson(request, FillBodySchema)
  const result = await fillForm({ userId, page: body.page, fields: body.fields })
  return jsonResponse(request, result)
})
