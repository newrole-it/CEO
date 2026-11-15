import {
  jsonResponse,
  preflight,
  readJson,
  SubmittedBodySchema,
  withToken,
} from "src/server/autofill/http"
import { resolveLocale } from "@newrole/app-kit/languages"
import { trackSubmission } from "src/server/autofill/track"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const POST = withToken(async (request, { userId }) => {
  const body = await readJson(request, SubmittedBodySchema)
  const result = await trackSubmission({
    userId,
    // The extension's requests carry the browser's languages, as the app's own pages do.
    locale: resolveLocale(null, request.headers.get("accept-language")),
    page: body.page,
    job: body.job,
    fields: body.fields,
  })
  return jsonResponse(request, result)
})
