import { failure, refuseCrossSite } from "@/server/http"
import { restoreVersion } from "@/server/store"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; versionId: string }> }
) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const { id, versionId } = await params
  const restored = await restoreVersion(id, versionId)
  return restored ? Response.json(restored) : failure("not-found", "Version not found.", 404)
}
