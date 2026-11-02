import { getBlitzContext } from "src/app/blitz-server"
import { CvError, MAX_CV_PDF_BYTES, uploadCvPdf } from "src/server/cv/service"
import { crossSiteRefused, isSameAppRequest } from "src/server/security/origin"

/** Stores an uploaded PDF as it is. Multipart: file, optional title and language. */
export async function POST(request: Request) {
  // getBlitzContext copies the anti-CSRF cookie into the header itself, so it checks nothing here.
  if (!isSameAppRequest(request)) return crossSiteRefused()
  let userId: number | null | undefined
  try {
    const ctx = await getBlitzContext()
    userId = ctx.session.userId
  } catch {
    return Response.json({ error: "Sign in required.", code: "auth" }, { status: 401 })
  }
  if (!userId) return Response.json({ error: "Sign in required.", code: "auth" }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: "Send a PDF file.", code: "not-pdf" }, { status: 400 })
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Send a PDF file.", code: "not-pdf" }, { status: 400 })
  }
  if (file.size > MAX_CV_PDF_BYTES) {
    return Response.json(
      { error: "That PDF is larger than 5 MB.", code: "too-large" },
      { status: 413 }
    )
  }
  const title = form.get("title")
  const language = form.get("language")
  try {
    const cv = await uploadCvPdf({
      userId,
      bytes: Buffer.from(await file.arrayBuffer()),
      name: file.name,
      title: typeof title === "string" ? title : undefined,
      language: language === "en" ? "en" : "pl",
    })
    return Response.json({ cv })
  } catch (error) {
    if (error instanceof CvError) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 })
    }
    console.error("cv upload failed", error instanceof Error ? error.message : error)
    return Response.json({ error: "Could not save that PDF.", code: "failed" }, { status: 500 })
  }
}
