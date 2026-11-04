import { printViewResponse } from "@newrole/cv-engine/http"
import { renderCvHtml } from "@newrole/cv-engine/render"
import { failure, refuseForeignHost } from "@/server/http"
import { getDocument, getVersion } from "@/server/store"

/**
 * The print view: the same HTML Chrome turns into the PDF, for printing from the browser.
 * ?auto=1 opens the print dialog once laid out. ?version=<id> shows an older version.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const { id } = await params
  const url = new URL(request.url)
  const document = await getDocument(id)
  if (!document) return failure("not-found", "Document not found.", 404)
  const versionId = url.searchParams.get("version")
  const version = versionId ? await getVersion(id, versionId) : null
  if (versionId && !version) return failure("not-found", "Version not found.", 404)
  const html = renderCvHtml(version?.content ?? document.content, {
    autoPrint: url.searchParams.get("auto") === "1",
    lang: version?.language ?? document.language,
  })
  return printViewResponse(html)
}
