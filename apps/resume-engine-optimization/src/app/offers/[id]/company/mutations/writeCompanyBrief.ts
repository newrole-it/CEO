"use server"
import { z } from "zod"
import { getLocale } from "src/app/i18n/server"
import { requireMember } from "src/app/users/guard"
import { companyBrief, CompanyBriefError } from "src/server/research/service"
import { resolver } from "src/server/rpc"
import { NotFoundError } from "src/shared/errors"

/**
 * "Napisz notatkę" on /offers/[id]/company: writes the company brief of the offer in the person's
 * interface language and keeps it in place of the one before (src/server/research/service.ts).
 * `web: false` leaves the web research out. A mutation because the web research can take minutes
 * and must never be refetched on its own.
 */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64), web: z.boolean() })),
  resolver.authorize(),
  async ({ jobId, web }, ctx) => {
    const userId = requireMember(ctx.session)
    try {
      const view = await companyBrief(userId, jobId, { locale: await getLocale(), web })
      return { written: view.brief !== null }
    } catch (error) {
      if (error instanceof CompanyBriefError) throw new NotFoundError(error.code)
      throw error
    }
  }
)
