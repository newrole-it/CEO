import db from "db"
import { classifyCompany } from "./role"
import { classificationFields } from "./persist"

const POOL = 12

async function eachLimited<T>(items: T[], run: (item: T) => Promise<void>) {
  let index = 0
  async function worker() {
    while (index < items.length) {
      const current = items[index]
      index += 1
      await run(current)
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, items.length) }, () => worker()))
}

export async function backfillClassifications(): Promise<{ jobs: number; companies: number }> {
  const companies = await db.company.findMany({
    where: { isTech: null },
    select: {
      id: true,
      industry: true,
      careerPages: { select: { provider: true }, take: 8 },
    },
  })
  let companyUpdates = 0
  for (const company of companies) {
    let verdict: boolean | null = null
    for (const page of company.careerPages) {
      const next = classifyCompany({ industry: company.industry, sourceType: page.provider })
      if (next === false) {
        verdict = false
        break
      }
      if (next === true) verdict = true
    }
    if (verdict == null && company.industry) {
      verdict = classifyCompany({ industry: company.industry })
    }
    if (verdict == null) continue
    await db.company.update({ where: { id: company.id }, data: { isTech: verdict } })
    companyUpdates += 1
  }

  const jobs = await db.job.findMany({
    select: { id: true, title: true, descriptionText: true },
  })
  await eachLimited(jobs, async (job) => {
    const fields = await classificationFields(job.title, job.descriptionText)
    await db.job.update({ where: { id: job.id }, data: fields })
  })
  return { jobs: jobs.length, companies: companyUpdates }
}
