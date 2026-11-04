import { linkedInBrowserAvailable } from "@newrole/profile/linkedin-browser"
import { hasBrowserImportHeader } from "@newrole/profile/linkedin-import"
import { failure, refuseCrossSite, refuseForeignHost } from "@/server/http"
import { browserImport, startBrowserImport } from "@/server/profile"

/**
 * Reads the person's own LinkedIn through Claude in their Chrome. newrole CV always runs on their
 * machine, so only the claude binary decides (LINKEDIN_BROWSER_IMPORT=off turns it off).
 */
export async function POST(request: Request) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  // a cross-site form cannot set this header without a preflight
  if (!hasBrowserImportHeader(request.headers))
    return failure("origin", "Start this from newrole CV.", 403)
  if (!linkedInBrowserAvailable(true)) {
    return failure("unavailable", "Reading LinkedIn needs Claude Code on this machine.", 404)
  }
  return Response.json(startBrowserImport())
}

export async function GET(request: Request) {
  const refused = refuseForeignHost(request)
  if (refused) return refused
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return failure("invalid", "Missing id.", 400)
  const job = browserImport(id)
  return job ? Response.json(job) : failure("not-found", "No such import.", 404)
}
