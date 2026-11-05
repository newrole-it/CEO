import { getBlitzContext } from "src/app/blitz-server"
import { isLocalInstall } from "src/server/local-install"
import { setupStatus } from "src/server/setup/status"

export const dynamic = "force-dynamic"

/** What /setup polls, and how `npm run go` recognises a running app. Local installs only. */
export async function GET() {
  if (!isLocalInstall()) return Response.json({ error: "Not found." }, { status: 404 })
  // The session lives in the database. With the database down this is still a useful answer.
  const userId = await getBlitzContext()
    .then((ctx) => ctx.session.userId ?? null)
    .catch(() => null)
  return Response.json(await setupStatus(userId), { headers: { "Cache-Control": "no-store" } })
}
