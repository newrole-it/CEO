import { resolver } from "@blitzjs/rpc"
import { NotFoundError } from "blitz"
import { z } from "zod"
import { getVersion } from "src/server/cv/versions"
import { requireMember } from "src/app/users/guard"

/** One version with its content, to compare it with the document. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      versionId: z.string().min(1).max(64),
    })
  ),
  async ({ id, versionId }, ctx) => {
    const version = await getVersion(requireMember(ctx.session), id, versionId)
    if (!version) throw new NotFoundError("Version not found.")
    return version
  }
)
