"use server"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"
import { z } from "zod"
import { restoreVersion } from "src/server/cv/versions"
import { requireMember } from "src/app/users/guard"

/** Puts a version's content back; the current state stays in the history. */
export default resolver.pipe(
  resolver.zod(
    z.object({
      id: z.string().min(1).max(64),
      versionId: z.string().min(1).max(64),
    })
  ),
  async ({ id, versionId }, ctx) => {
    const userId = requireMember(ctx.session)
    const restored = await restoreVersion(userId, id, versionId)
    if (!restored) throw new NotFoundError("Version not found.")
    return restored
  }
)
