import { MAX_IMPORT_BODY_BYTES } from "@newrole/profile/import-text"
import { errorResponse, failure, refuseCrossSite } from "@/server/http"
import { importProfile } from "@/server/profile"

/**
 * A CV PDF, LinkedIn's data export ZIP or pasted text → a profile draft to review. The body is
 * measured before it is read: the declared length, never the buffered bytes.
 */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const length = Number(request.headers.get("content-length") ?? NaN)
  if (!Number.isFinite(length)) return failure("invalid", "Send a PDF or pasted text.", 411)
  if (length > MAX_IMPORT_BODY_BYTES)
    return failure("too-large", "That ZIP is larger than 50 MB.", 413)
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return failure("invalid", "Send a PDF or pasted text.", 400)
  }
  const text = form.get("text")
  const file = form.get("file")
  try {
    return Response.json(
      await importProfile({
        text: typeof text === "string" ? text : "",
        file: file instanceof File ? file : null,
      })
    )
  } catch (error) {
    return errorResponse(error)
  }
}
