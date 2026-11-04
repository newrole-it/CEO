import { z } from "zod"
import { failure, readBody, refuseCrossSite, refuseForeignHost } from "@/server/http"
import { listVersions, saveVersion } from "@/server/store"

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const versions = await listVersions((await params).id)
  return versions ? Response.json(versions) : failure("not-found", "Document not found.", 404)
}

/** "Zapisz wersję": keeps what is stored now, under a name if given. */
export async function POST(request: Request, { params }: Params) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const body = await readBody(request, z.object({ label: z.string().max(200).optional() }))
  if (body instanceof Response) return body
  const saved = await saveVersion((await params).id, body.label)
  return saved ? Response.json(saved) : failure("not-found", "Document not found.", 404)
}
