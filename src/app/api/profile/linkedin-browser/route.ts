import { getBlitzContext } from "src/app/blitz-server"
import { draftFromProfileText } from "src/server/profile/import"
import { linkedInBrowserAvailable, readLinkedInViaClaude } from "@newrole/profile/linkedin-browser"
import { isLocalInstall } from "src/server/local-install"
import { linkedInJobs } from "@newrole/profile/linkedin-jobs"
import { isAppHostRequest, isSameAppRequest } from "src/server/security/origin"
import { hasBrowserImportHeader } from "@newrole/profile/linkedin-import"

/**
 * The import reads the person's own LinkedIn in their Chrome, so only they may start it or see the
 * result: a session is required (Onboarding starts a guest one), and the job is keyed to it.
 */
async function owner(): Promise<{ key: string; userId: number } | null> {
  try {
    const ctx = await getBlitzContext()
    if (ctx.session.userId) return { key: `user:${ctx.session.userId}`, userId: ctx.session.userId }
  } catch {
    // no usable session
  }
  return null
}

const refused = () => Response.json({ error: "Start the import from newrole.it." }, { status: 403 })
const signInFirst = () =>
  Response.json({ error: "Sign in required.", code: "auth" }, { status: 401 })

export async function POST(request: Request) {
  // A DNS-rebinding page is same-origin with the name it chose, so the Host must be this app's.
  if (!isSameAppRequest(request) || !hasBrowserImportHeader(request.headers)) {
    return refused()
  }
  if (!linkedInBrowserAvailable(isLocalInstall())) {
    return Response.json(
      { error: "Reading LinkedIn through Claude works only in a local install with Claude Code." },
      { status: 404 }
    )
  }
  const who = await owner()
  if (!who) return signInFirst()
  const { id } = linkedInJobs().start(who.key, async ({ stage }) => {
    const read = await readLinkedInViaClaude({ onStage: stage })
    if (read.status !== "ok" || !read.text) return { status: read.status, message: read.message }
    stage("analyzing")
    const { draft } = await draftFromProfileText(read.text, who.userId)
    return { status: "ok", message: read.message, draft }
  })
  return Response.json({ jobId: id })
}

export async function GET(request: Request) {
  if (!isAppHostRequest(request)) return refused()
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 })
  const who = await owner()
  if (!who) return signInFirst()
  const job = linkedInJobs().get(id, who.key)
  if (!job) return Response.json({ error: "No such import." }, { status: 404 })
  return Response.json(job)
}
