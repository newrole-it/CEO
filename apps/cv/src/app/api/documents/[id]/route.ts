import { z } from "zod"
import { CvContent } from "@newrole/cv-core/schema"
import { errorResponse, readBody, refuseCrossSite } from "@/server/http"
import { deleteDocument, updateDocument } from "@/server/store"

type Params = { params: Promise<{ id: string }> }

/** Autosave from the editor. A save older than what is stored fails with "conflict". */
export async function PATCH(request: Request, { params }: Params) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const { id } = await params
  const body = await readBody(
    request,
    z.object({
      title: z.string().max(200).optional(),
      language: z.enum(["pl", "en"]).optional(),
      content: CvContent.optional(),
      baseUpdatedAt: z.coerce.date().optional(),
    })
  )
  if (body instanceof Response) return body
  try {
    const document = await updateDocument(id, body)
    return Response.json({ id: document.id, updatedAt: document.updatedAt })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  await deleteDocument((await params).id)
  return new Response(null, { status: 204 })
}
