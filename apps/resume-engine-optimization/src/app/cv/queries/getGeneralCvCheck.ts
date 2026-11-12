"use server"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"
import { z } from "zod"
import { requireMember } from "src/app/users/guard"
import { checkGeneralCv } from "src/server/cv/tailor"

/**
 * Before "Zapisz jako ogólne CV": what the CV for an offer still says about the offer's company.
 * `into` as saveCvToGeneral takes it.
 */
export default resolver.pipe(
  resolver.zod(
    z.object({ id: z.string().min(1).max(64), into: z.string().min(1).max(64).optional() })
  ),
  async ({ id, into }, ctx) => {
    const userId = requireMember(ctx.session)
    const check = await checkGeneralCv(userId, id, into)
    if (!check) throw new NotFoundError()
    return check
  }
)
