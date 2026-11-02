import { jsonResponse, preflight, readJson, withToken } from "src/server/autofill/http"
import { OpenedMailSchema, previewOpenedMail } from "src/server/gmail/opened"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

/** The message open in Gmail: what it says and which application it is likely about. Saves nothing. */
export const POST = withToken(async (request, { userId }) => {
  const mail = await readJson(request, OpenedMailSchema)
  return jsonResponse(request, await previewOpenedMail(userId, mail))
})
