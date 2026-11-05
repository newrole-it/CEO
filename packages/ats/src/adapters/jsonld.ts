import type { ListedJob, SourceType } from "../schemas"
import { asDate, buildListedJob } from "./parse"
import {
  asRecord,
  identifierValue,
  jobPostingNodes,
  locationText,
  salaryFrom,
  textValue,
} from "@newrole/offers/jsonld"
import { htmlToText } from "@newrole/offers/text"
import { aiOptOut, excerpt } from "@newrole/offers/hygiene"
import { canonicalHref } from "./successfactors"

export function parseJsonLdJobs(
  html: string,
  pageUrl: string,
  companyName?: string,
  opts?: { provider?: string; sourceType?: SourceType; boardId?: string; fullText?: boolean }
): ListedJob[] {
  const jobs: ListedJob[] = []
  for (const job of jobPostingNodes(html)) {
    const title = textValue(job.title) || textValue(job.name)
    const hiring = asRecord(job.hiringOrganization)
    const stated = textValue(job.url) || canonicalHref(html)
    if (!title) continue
    if (!stated && opts?.provider === "brave") continue
    const url = stated || pageUrl
    let host = ""
    try {
      host = new URL(url).hostname
    } catch {
      host = ""
    }
    const salary = salaryFrom(job.baseSalary)
    const plain = typeof job.description === "string" ? htmlToText(job.description) : undefined
    const description = plain && !opts?.fullText ? excerpt(plain) : plain
    const listed = buildListedJob({
      externalId: identifierValue(job.identifier),
      title,
      companyName: textValue(hiring?.name) || companyName,
      locationText: locationText(job.jobLocation),
      employmentType: textValue(job.employmentType),
      descriptionText: description,
      salaryMin: salary.min,
      salaryMax: salary.max,
      salaryCurrency: salary.currency,
      publishedAt: asDate(job.datePosted),
      originalUrl: url,
      sourceType: opts?.sourceType ?? "GENERIC_HTML",
      sourceBoardId: opts?.boardId,
      needsHydration: false,
      llmOptOut: aiOptOut(html, host),
    })
    if (listed) jobs.push(listed)
  }
  return jobs
}
