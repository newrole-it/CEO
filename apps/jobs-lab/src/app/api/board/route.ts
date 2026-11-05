import { z } from "zod"
import { PROVIDERS, readBoard } from "src/server/lab"
import { guard, refused } from "src/server/guard"

export const dynamic = "force-dynamic"

const input = z.object({
  provider: z.enum(PROVIDERS as [string, ...string[]]),
  boardId: z.string().trim().min(1).max(300),
})

/** One board read live through its adapter. */
export async function POST(request: Request) {
  if (!guard.isSameAppRequest(request)) return refused()
  const parsed = input.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: "Pick a platform and a board id." }, { status: 400 })
  return Response.json(
    await readBoard(parsed.data.provider as (typeof PROVIDERS)[number], parsed.data.boardId)
  )
}
