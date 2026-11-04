import { documentPdfName, pdfResponse } from "@newrole/cv-engine/http"
import { renderCvHtml, renderPdfFromHtml } from "@newrole/cv-engine/render"
import { failure, refuseForeignHost } from "@/server/http"
import { getDocument } from "@/server/store"

/** The document as a PDF from local Chrome. 503 when there is none: the editor prints instead. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const document = await getDocument((await params).id)
  if (!document) return failure("not-found", "Document not found.", 404)
  const bytes = await renderPdfFromHtml(
    renderCvHtml(document.content, { print: true, lang: document.language })
  )
  if (!bytes) return failure("chrome-unavailable", "No Chrome to print with.", 503)
  const name = documentPdfName(document.content, document.docType, document.language)
  return pdfResponse(bytes, name, new URL(request.url).searchParams.get("inline") === "1")
}
