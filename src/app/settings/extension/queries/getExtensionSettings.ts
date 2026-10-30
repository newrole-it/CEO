import path from "node:path"
import { resolver } from "@blitzjs/rpc"
import { requireMember } from "src/app/feedback/guard"
import { listApiTokens } from "src/server/auth/api-tokens"

/** Settings → Chrome extension: the built folder to load unpacked, and the person's tokens (no hashes). */
export default resolver.pipe(async (_input: null, ctx) => {
  const userId = requireMember(ctx.session)
  return {
    extensionPath: path.join(process.cwd(), "extension", ".output", "chrome-mv3"),
    tokens: await listApiTokens(userId),
  }
})
