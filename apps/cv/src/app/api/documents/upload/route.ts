import { errorResponse, failure, refuseCrossSite } from "@/server/http"
import { cvFromPdf, MAX_CV_PDF_BYTES } from "@/server/writing"

/** A CV PDF becomes an editable CV. The file itself is read in memory and not kept. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  let file: FormDataEntryValue | null = null
  try {
    file = (await request.formData()).get("file")
  } catch {
    return failure("invalid", "Send the PDF as form data.", 400)
  }
  if (!(file instanceof File)) return failure("invalid", "Choose a PDF.", 400)
  if (file.size > MAX_CV_PDF_BYTES) return failure("invalid", "The PDF is larger than 5 MB.", 413)
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-")
    return failure("invalid", "That file is not a PDF.", 400)
  try {
    const { document, reader } = await cvFromPdf(bytes, file.name)
    return Response.json({ id: document.id, reader })
  } catch (error) {
    return errorResponse(error)
  }
}
