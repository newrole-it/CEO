import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob, WorkplaceType } from "src/shared/schemas"
import { namesAgree } from "./blocked"
import { isSlugAlias, tenantHost } from "./hosts"
import { asDate, buildListedJob } from "./parse"
import type { BoardList } from "./types"
import { channelPreamble, tagBlocks, tagText } from "./xml"

const PAGE_SIZE = 100
const MAX_PAGES = 3

export function teamtailorHost(boardId: string): string {
  return tenantHost(boardId, "teamtailor.com")
}

export function teamtailorRssUrl(boardId: string, offset = 0): string {
  const url = new URL(`https://${teamtailorHost(boardId)}/jobs.rss`)
  url.searchParams.set("per_page", String(PAGE_SIZE))
  url.searchParams.set("offset", String(offset))
  return url.toString()
}

function workplace(status: string | undefined): WorkplaceType {
  const value = status?.toLowerCase()
  if (value === "fully" || value === "remote") return "REMOTE"
  if (value === "hybrid") return "HYBRID"
  if (value === "none" || value === "onsite" || value === "on-site") return "ONSITE"
  return "UNKNOWN"
}

function jobId(link: string | undefined): string | undefined {
  if (!link) return undefined
  const match = link.match(/\/jobs\/(\d+)/)
  return match?.[1]
}

export function parseTeamtailorRss(
  xml: string,
  boardId: string,
  companyName?: string
): { jobs: ListedJob[]; channelTitle?: string } {
  const channelTitle = tagText(channelPreamble(xml), "title")
  const jobs = tagBlocks(xml, "item").flatMap((item) => {
    const link = tagText(item, "link") || tagText(item, "guid")
    const title = tagText(item, "title")
    if (!link || !title) return []
    const places = tagBlocks(item, "tt:location").map((place) => {
      const city = tagText(place, "tt:city")
      const country = tagText(place, "tt:country")
      return [city, country].filter(Boolean).join(", ")
    })
    const listed = buildListedJob({
      externalId: jobId(link) || jobId(tagText(item, "guid")),
      title,
      companyName: companyName || channelTitle,
      locationText: places.filter(Boolean).join(" | ") || undefined,
      workplaceType: workplace(tagText(item, "tt:remoteStatus")),
      descriptionHtml: tagText(item, "description"),
      publishedAt: asDate(tagText(item, "pubDate")),
      originalUrl: link,
      sourceType: "TEAMTAILOR",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
  return { jobs, channelTitle }
}

export async function listTeamtailor(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const seen = new Set<string>()
  const jobs: ListedJob[] = []
  let channelTitle: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await http.get(teamtailorRssUrl(boardId, page * PAGE_SIZE), {
      maxBytes: 8_000_000,
      accept: "application/rss+xml, application/xml, text/xml, */*;q=0.1",
    })
    if (response.status === 404) {
      if (page === 0)
        return { jobs: [], proven: false, note: `Teamtailor ${boardId} was not found` }
      break
    }
    if (response.status >= 400) throw new Error(`Teamtailor ${boardId} returned ${response.status}`)
    const parsed = parseTeamtailorRss(response.body, boardId, companyName)
    channelTitle = channelTitle || parsed.channelTitle
    let added = 0
    for (const job of parsed.jobs) {
      const key = job.externalId || job.originalUrl
      if (seen.has(key)) continue
      seen.add(key)
      jobs.push(job)
      added += 1
    }
    if (parsed.jobs.length < PAGE_SIZE || added === 0) break
  }
  if (
    companyName &&
    channelTitle &&
    !isSlugAlias(companyName, boardId) &&
    !namesAgree(companyName, channelTitle)
  ) {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `Teamtailor channel “${channelTitle}” does not match ${companyName}`,
    }
  }
  const resolved =
    !companyName || isSlugAlias(companyName, boardId) ? channelTitle || companyName : companyName
  if (jobs.length === 0)
    return {
      jobs: [],
      proven: false,
      companyName: resolved,
      note: `Teamtailor ${boardId} has no open jobs`,
    }
  return {
    jobs: jobs.map((job) => ({ ...job, companyName: job.companyName || resolved })),
    proven: true,
    companyName: resolved,
  }
}
