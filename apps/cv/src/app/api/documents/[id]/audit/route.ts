import { z } from "zod"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { auditDocument, dismissAuditNotes } from "@/server/profile"

type Params = { params: Promise<{ id: string }> }

/** Audits the saved CV. The editor saves first, so this reads what is on the screen. */
export async function POST(request: Request, { params }: Params) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(request, z.object({ locale: z.enum(["pl", "en"]) }))
  if (body instanceof Response) return body
  try {
    return Response.json(await auditDocument((await params).id, body.locale))
  } catch (error) {
    return errorResponse(error)
  }
}

/** Which notes of the latest audit the person skipped. */
export async function PATCH(request: Request, { params }: Params) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(
    request,
    z.object({ dismissed: z.array(z.string().max(120)).max(200) })
  )
  if (body instanceof Response) return body
  try {
    return Response.json(await dismissAuditNotes((await params).id, body.dismissed))
  } catch (error) {
    return errorResponse(error)
  }
}
