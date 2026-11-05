import { z } from "zod"
import { readLink } from "src/server/lab"
import { guard, refused } from "src/server/guard"

export const dynamic = "force-dynamic"

const input = z.object({ url: z.string().trim().min(4).max(2000) })

/** One offer from its link and its whole text, as newrole.it's Add offer reads it. */
export async function POST(request: Request) {
  if (!guard.isSameAppRequest(request)) return refused()
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Paste a link." }, { status: 400 })
  return Response.json(await readLink(parsed.data.url))
}
