import { ApplicantInfoSchema } from "@newrole/profile/applicant"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { saveApplicantDetails } from "@/server/profile"

/** The form details; returns them saved and with the gaps filled. */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(request, ApplicantInfoSchema)
  if (body instanceof Response) return body
  try {
    return Response.json(await saveApplicantDetails(body))
  } catch (error) {
    return errorResponse(error)
  }
}
