import { failure, refuseForeignHost } from "@/server/http"
import { getVersion } from "@/server/store"

/** One version with its content, to compare it with the document. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const { id, versionId } = await params
  const version = await getVersion(id, versionId)
  return version ? Response.json(version) : failure("not-found", "Version not found.", 404)
}
