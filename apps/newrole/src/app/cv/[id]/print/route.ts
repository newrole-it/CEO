import { getBlitzContext } from "src/app/blitz-server"
import { printViewResponse } from "@newrole/cv-engine/http"
import { renderCvHtml } from "@newrole/cv-engine/render"
import { getCv } from "src/server/cv/service"
import { getVersion } from "src/server/cv/versions"

/**
 * The print view: the same HTML Chrome turns into the PDF, for "Drukuj / Zapisz jako PDF" in
 * the browser. A route rather than a page, because it is a whole document outside the app shell.
 * ?auto=1 opens the print dialog once the pages are laid out. ?version=<id> shows an older version.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBlitzContext()
  const userId = ctx.session.userId
  const { id } = await params
  const url = new URL(request.url)
  if (!userId) {
    return Response.redirect(
      new URL(`/login?returnTo=${encodeURIComponent(`/cv/${id}`)}`, url),
      303
    )
  }
  const cv = await getCv(userId, id)
  if (!cv) return new Response("CV not found.", { status: 404 })
  if (!cv.content) return Response.redirect(new URL(`/api/cv/${id}/pdf?inline=1`, url), 303)
  const versionId = url.searchParams.get("version")
  const version = versionId ? await getVersion(userId, id, versionId) : null
  if (versionId && !version) return new Response("Version not found.", { status: 404 })
  const html = renderCvHtml(version?.content ?? cv.content, {
    autoPrint: url.searchParams.get("auto") === "1",
    lang: version?.language ?? cv.language,
  })
  return printViewResponse(html)
}
