import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { listApiTokens } from "src/server/auth/api-tokens"
import { extensionBuildPath } from "src/server/repo"

/** Settings → Chrome extension: the built folder to load unpacked, and the person's tokens (no hashes). */
export default resolver.pipe(async (_input: null, ctx) => {
  const userId = requireMember(ctx.session)
  return {
    extensionPath: extensionBuildPath(),
    tokens: await listApiTokens(userId),
  }
})
