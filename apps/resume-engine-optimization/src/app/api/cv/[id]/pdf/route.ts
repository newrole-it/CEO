import { pdfResponse } from "@newrole/cv-engine/http"
import { getSession } from "src/server/auth/session"
import { cvPdf, getCv } from "src/server/cv/service"

/**
 * The CV as a PDF for the signed-in person. A download is kept in the CV's history; ?inline=1
 * shows it in the browser and keeps nothing. 503 means the PDF could not be rendered (no local
 * Chrome); the editor then opens the print view.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 })
  const { id } = await params
  const cv = await getCv(userId, id)
  if (!cv) return Response.json({ error: "CV not found." }, { status: 404 })
  const inline = new URL(request.url).searchParams.get("inline") === "1"
  const pdf = await cvPdf(userId, id, { leaves: !inline })
  if (!pdf) return Response.json({ error: "chrome-unavailable" }, { status: 503 })
  return pdfResponse(pdf.bytes, pdf.name, inline)
}
