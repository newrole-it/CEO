import {
  jsonResponse,
  preflight,
  readJson,
  SubmittedBodySchema,
  withToken,
} from "src/server/autofill/http"
import { trackSubmission } from "src/server/autofill/track"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const POST = withToken(async (request, { userId }) => {
  const body = await readJson(request, SubmittedBodySchema)
  const result = await trackSubmission({
    userId,
    page: body.page,
    job: body.job,
    fields: body.fields,
  })
  return jsonResponse(request, result)
})
