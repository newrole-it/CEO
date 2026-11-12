import { z } from "zod"
import db from "db"
import { getSession } from "src/server/auth/session"
import { createApiToken } from "src/server/auth/api-tokens"
import {
  defaultTokenName,
  errorResponse,
  failure,
  isSameOrigin,
  jsonResponse,
  preflight,
  readJson,
} from "src/server/autofill/http"

export const dynamic = "force-dynamic"

export const OPTIONS = preflight

const BodySchema = z.object({ name: z.string().max(200).nullish() })

/** Pairing from /connect/extension: the session cookie of a signed-in person creates a token. */
export async function POST(request: Request) {
  try {
    if (!isSameOrigin(request)) return errorResponse(request, "Cross-site request refused.", 403)
    const session = await getSession()
    const userId = session.userId
    if (!userId) return errorResponse(request, "Sign in required.", 401)
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    })
    if (!user || user.deletedAt || user.role === "GUEST") {
      return errorResponse(request, "Sign in required.", 401)
    }
    const body = await readJson(request, BodySchema)
    const { token } = await createApiToken(userId, body.name?.trim() || defaultTokenName())
    return jsonResponse(request, { token })
  } catch (error) {
    return failure(request, error)
  }
}
