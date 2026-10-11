import db from "db"
import { getBlitzContext } from "src/app/blitz-server"
import { exportAccount } from "src/server/privacy/export"

export async function GET() {
  const ctx = await getBlitzContext()
  const userId = ctx.session.userId
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (!user || user.role === "GUEST") {
    return Response.json({ error: "Sign in required." }, { status: 401 })
  }
  const data = await exportAccount(userId)
  if (!data) return Response.json({ error: "Sign in required." }, { status: 401 })
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="jobscanner-export.json"',
      "Cache-Control": "no-store",
    },
  })
}
