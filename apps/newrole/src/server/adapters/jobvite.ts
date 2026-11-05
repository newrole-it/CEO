import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { decodeEntities } from "@newrole/offers/text"
import { stripTags } from "./html-bits"
import { parseJsonLdJobs } from "./jsonld"
import { buildListedJob } from "./parse"
import type { BoardList } from "./types"

/**
 * Jobvite career sites: `jobs.jobvite.com/{slug}/jobs` (older sites: `/careers/{slug}/jobs`).
 * Board id: the slug. The listing server-renders one `/job/{code}` link per posting and each
 * job page carries a schema.org JobPosting with the description. Undocumented.
 * The parser follows freehire's adapter; no live board with postings was reachable on
 * 2026-10-31 (unknown slugs redirect to search.jobvite.com/?invalid=1), so a listing without
 * job links is reported as unproven rather than empty.
 */

export function jobviteSlug(boardId: string): string {
  return boardId
    .trim()
    .replace(/^https?:\/\/jobs\.jobvite\.com\//i, "")
    .replace(/^careers\//i, "")
    .replace(/\/.*$/, "")
}

export function jobviteListUrls(boardId: string): string[] {
  const slug = encodeURIComponent(jobviteSlug(boardId))
  return [`https://jobs.jobvite.com/${slug}/jobs`, `https://jobs.jobvite.com/careers/${slug}/jobs`]
}

export function jobviteJobCode(url: string): string | null {
  return url.match(/\/job\/([A-Za-z0-9]+)(?:[/?#]|$)/)?.[1] ?? null
}

export type JobviteLink = { url: string; code: string; title: string; location?: string }

export function parseJobviteListing(html: string, pageUrl: string): JobviteLink[] {
  const out: JobviteLink[] = []
  const seen = new Set<string>()
  const anchors = [
    ...html.matchAll(/<a\b[^>]*href="([^"]*\/job\/[A-Za-z0-9]+[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi),
  ]
  anchors.forEach((anchor, index) => {
    let url: URL
    try {
      url = new URL(decodeEntities(anchor[1]), pageUrl)
    } catch {
      return
    }
    url.hash = ""
    const code = jobviteJobCode(url.pathname)
    if (!code || seen.has(code)) return
    const title = stripTags(anchor[2])
    if (!title) return
    seen.add(code)
    const next = anchors[index + 1]?.index ?? html.length
    const between = html.slice((anchor.index ?? 0) + anchor[0].length, next)
    const location = between.match(/jv-job-list-location[^>]*>([\s\S]*?)<\/[a-z]+>/i)?.[1]
    out.push({
      url: url.toString(),
      code,
      title,
      location: location ? stripTags(location) || undefined : undefined,
    })
  })
  return out
}

export async function listJobvite(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const slug = jobviteSlug(boardId)
  let links: JobviteLink[] = []
  let invalid = false
  for (const url of jobviteListUrls(slug)) {
    const response = await http.get(url, { accept: "text/html", maxBytes: 4_000_000 })
    if (response.status >= 400) continue
    if (/invalid=1|job-seeker-support/i.test(response.url || "")) {
      invalid = true
      continue
    }
    links = parseJobviteListing(response.body, response.url || url)
    if (links.length) break
  }
  if (invalid && links.length === 0)
    return { jobs: [], proven: false, companyName, note: `Jobvite ${slug} was not found` }
  if (links.length === 0)
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Jobvite ${slug} rendered no job links. The site may be client-rendered.`,
    }
  const jobs = links.flatMap((link) => {
    const job = buildListedJob({
      externalId: link.code,
      title: link.title,
      companyName,
      locationText: link.location,
      originalUrl: link.url,
      sourceType: "JOBVITE",
      sourceBoardId: slug,
      needsHydration: true,
    })
    return job ? [job] : []
  })
  return { jobs, proven: true, companyName, complete: true, listedCount: jobs.length }
}

export async function hydrateJobvite(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText) return job
  const response = await http.get(job.originalUrl, { accept: "text/html", maxBytes: 2_000_000 })
  if (response.status >= 400) return job
  const found = parseJsonLdJobs(response.body, job.originalUrl, job.companyName, {
    provider: "jobvite",
    sourceType: "JOBVITE",
    boardId: job.sourceBoardId,
    fullText: true,
  })[0]
  if (!found) return job
  return {
    ...job,
    ...found,
    externalId: job.externalId,
    originalUrl: job.originalUrl,
    companyName: job.companyName || found.companyName,
    locationText: found.locationText || job.locationText,
    needsHydration: false,
  }
}
