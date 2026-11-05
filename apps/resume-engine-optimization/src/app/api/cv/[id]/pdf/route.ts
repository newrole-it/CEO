import { pdfResponse } from "@newrole/cv-engine/http"
import { getBlitzContext } from "src/app/blitz-server"
import { cvPdf, getCv } from "src/server/cv/service"

/**
 * The CV as a PDF for the signed-in person. ?inline=1 shows it in the browser. 503 means the
 * PDF could not be rendered (no local Chrome); the editor then opens the print view.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getBlitzContext()
  const userId = ctx.session.userId
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 })
  const { id } = await params
  const cv = await getCv(userId, id)
  if (!cv) return Response.json({ error: "CV not found." }, { status: 404 })
  const pdf = await cvPdf(userId, id)
  if (!pdf) return Response.json({ error: "chrome-unavailable" }, { status: 503 })
  const inline = new URL(request.url).searchParams.get("inline") === "1"
  return pdfResponse(pdf.bytes, pdf.name, inline)
}
