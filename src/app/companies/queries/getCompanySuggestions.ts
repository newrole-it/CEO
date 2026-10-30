import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { companySuggestions } from "src/server/discovery/similar-companies"

/** "Podobne firmy, których możesz nie znać" with an explicit availability status. */
export default resolver.pipe(
  resolver.zod(z.object({ limit: z.number().int().min(1).max(24).optional() })),
  async ({ limit }, ctx) => {
    if (!ctx.session.userId) {
      return { status: "needs-likes" as const, suggestions: [], canSearch: false, message: "" }
    }
    return companySuggestions(ctx.session.userId, limit ?? 9)
  }
)
