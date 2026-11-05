import db from "db"
import { errorResponse, jsonResponse, preflight, withToken } from "src/server/autofill/http"
import { defaultCv } from "src/server/cv/service"
import { getApplicant } from "src/server/profile/applicant"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

export const GET = withToken(async (request, { userId }) => {
  const [user, applicant, cv] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } }),
    getApplicant(userId),
    defaultCv(userId),
  ])
  if (!user) return errorResponse(request, "Missing or invalid token.", 401)
  return jsonResponse(request, {
    user,
    applicant: applicant.effective,
    // An editable CV renders on demand, so it counts as having a PDF.
    defaultCv: cv ? { id: cv.id, title: cv.title, hasPdf: cv.hasPdf || cv.hasContent } : null,
  })
})
