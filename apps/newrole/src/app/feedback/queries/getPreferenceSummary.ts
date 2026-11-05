import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { getPreferenceSummary } from "src/server/preferences/model"
import { requireMember } from "../guard"
import { LocaleInput } from "../schema"

/** "Twój gust": learned tags with sign, count and the offers behind them. Mute with muteSignal. */
export default resolver.pipe(
  resolver.zod(z.object({ locale: LocaleInput })),
  resolver.authorize(),
  async ({ locale }, ctx) => {
    const userId = requireMember(ctx.session)
    return getPreferenceSummary(userId, locale)
  }
)
