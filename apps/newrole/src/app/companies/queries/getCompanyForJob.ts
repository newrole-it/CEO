import { resolver } from "@blitzjs/rpc"
import db from "db"
import { z } from "zod"
import { primaryPage } from "src/server/watchlist/watch"
import { providerLabel } from "../providers"

export type CompanyInfo = {
  companyId: string
  name: string
  openJobs: number
  watching: boolean
  readMode: "ats" | "career-site" | "link-only" | null
  provider: string | null
  careerPageUrl: string | null
}

/** "O firmie" in the offer drawer: how we read the company, its open offers, watch state. */
export default resolver.pipe(
  resolver.zod(z.object({ jobId: z.string().min(1).max(64) })),
  async ({ jobId }, ctx): Promise<CompanyInfo | null> => {
    const job = await db.job.findUnique({
      where: { id: jobId },
      select: {
        company: {
          select: {
            id: true,
            name: true,
            careerPages: {
              select: { url: true, enabled: true, lastSuccessfulFetchAt: true, provider: true },
            },
          },
        },
      },
    })
    if (!job) return null
    const company = job.company
    const [openJobs, watched] = await Promise.all([
      db.job.count({ where: { companyId: company.id, status: "ACTIVE" } }),
      ctx.session.userId
        ? db.watchedCompany.findUnique({
            where: { userId_companyId: { userId: ctx.session.userId, companyId: company.id } },
            select: { id: true },
          })
        : null,
    ])
    const page = primaryPage(company.careerPages)
    const provider = page?.provider ?? null
    const readMode = !page
      ? null
      : provider === "CAREER_SITE" || provider === "GENERIC_HTML"
      ? page.enabled
        ? ("career-site" as const)
        : ("link-only" as const)
      : provider === "WEB_SEARCH"
      ? ("link-only" as const)
      : ("ats" as const)
    return {
      companyId: company.id,
      name: company.name,
      openJobs,
      watching: Boolean(watched),
      readMode,
      provider: providerLabel(provider),
      careerPageUrl: page?.url ?? null,
    }
  }
)
