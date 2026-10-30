import { headers } from "next/headers"
import { getBlitzContext } from "src/app/blitz-server"
import { appOrigin } from "src/server/auth/email"
import { draftFromProfileText } from "src/server/profile/import"
import { linkedInBrowserAvailable, readLinkedInViaClaude } from "src/server/profile/linkedin-browser"
import { linkedInJobs } from "src/server/profile/linkedin-jobs"
import { BROWSER_IMPORT_HEADER } from "src/shared/linkedin-import"

async function owner(): Promise<{ key: string; userId?: number }> {
  try {
    const ctx = await getBlitzContext()
    if (ctx.session.userId) return { key: `user:${ctx.session.userId}`, userId: ctx.session.userId }
  } catch {
    // no session yet: fall back to the address
  }
  const list = await headers()
  const ip = list.get("x-forwarded-for")?.split(",")[0]?.trim() || list.get("x-real-ip") || "local"
  return { key: `ip:${ip}` }
}

/** The Origin must be this app: the Host the browser used, or APP_ORIGIN. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    const host = new URL(origin).host
    return host === request.headers.get("host") || host === new URL(appOrigin()).host
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || request.headers.get(BROWSER_IMPORT_HEADER) !== "1") {
    return Response.json({ error: "Start the import from Nowa Rola." }, { status: 403 })
  }
  if (!linkedInBrowserAvailable()) {
    return Response.json(
      { error: "Reading LinkedIn through Claude works only in a local install with Claude Code." },
      { status: 404 }
    )
  }
  const who = await owner()
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
  const id = new URL(request.url).searchParams.get("id")
  if (!id) return Response.json({ error: "Missing id." }, { status: 400 })
  const who = await owner()
  const job = linkedInJobs().get(id, who.key)
  if (!job) return Response.json({ error: "No such import." }, { status: 404 })
  return Response.json(job)
}
