import { pdfResponse } from "@newrole/cv-engine/http"
import { getSession } from "src/server/auth/session"
import { versionPdf } from "src/server/cv/versions"

/** The PDF a version of the signed-in person's CV keeps: the uploaded original or one that left. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const session = await getSession()
  const userId = session.userId
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 })
  const { id, versionId } = await params
  const pdf = await versionPdf(userId, id, versionId)
  if (!pdf) return Response.json({ error: "No PDF for this version." }, { status: 404 })
  return pdfResponse(pdf.bytes, pdf.name)
}
