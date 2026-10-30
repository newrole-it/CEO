import { resolver } from "@blitzjs/rpc"
import { z } from "zod"
import { formatSalary, urlKey } from "src/server/applications/logic"
import { findApplicationByUrl, findJobByUrl } from "src/server/applications/service"
import { requireMember } from "src/app/feedback/guard"

/** "Dodaj aplikację": fills company and role from the index and warns about a duplicate. */
export default resolver.pipe(
  resolver.zod(z.object({ url: z.string().max(2000) })),
  resolver.authorize(),
  async ({ url }, ctx) => {
    const userId = requireMember(ctx.session)
    if (!urlKey(url)) return { valid: false, job: null, existing: null }
    const [job, existing] = await Promise.all([
      findJobByUrl(url),
      findApplicationByUrl(userId, url),
    ])
    return {
      valid: true,
      job: job
        ? {
            jobId: job.id,
            company: job.company.name,
            title: job.title,
            location: job.locationText,
            salaryText: formatSalary(job.salaryMin, job.salaryMax, job.salaryCurrency),
          }
        : null,
      existing: existing
        ? {
            id: existing.id,
            company: existing.company,
            title: existing.title,
            status: existing.status,
          }
        : null,
    }
  }
)
