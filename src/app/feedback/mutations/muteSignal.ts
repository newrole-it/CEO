import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { dropSignal, restoreSignal } from "src/server/preferences/model"
import { requireMember } from "../guard"

/**
 * Removes one learned signal from "Twój gust" (key from getPreferenceSummary, e.g. "skill:kotlin").
 * `restore: true` undoes it. Verdicts and picked chips are kept.
 */
export default resolver.pipe(
  resolver.zod(z.object({ key: z.string().min(3).max(120), restore: z.boolean().optional() })),
  resolver.authorize(),
  async ({ key, restore }, ctx) => {
    const userId = requireMember(ctx.session)
    const result = restore ? await restoreSignal(userId, key) : await dropSignal(userId, key)
    return { key, muted: !restore, updated: result.updated }
  }
)
