import { parseRobots, robotsAllows } from "@newrole/offers/robots"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { inferWorkplace } from "src/server/jobs/normalize"
import { tenantHost } from "./hosts"
import { asDate, buildListedJob } from "./parse"
import type { BoardList } from "./types"
import { tagBlocks, tagText } from "./xml"

export function personioFeedUrls(boardId: string): string[] {
  if (boardId.includes(".")) return [`https://${boardId.toLowerCase()}/xml?language=en`]
  const slug = boardId.trim().toLowerCase()
  return [
    `https://${tenantHost(slug, "jobs.personio.de")}/xml?language=en`,
    `https://${tenantHost(slug, "jobs.personio.com")}/xml?language=en`,
  ]
}

export function parsePersonioXml(
  xml: string,
  boardId: string,
  origin: string,
  companyName?: string
): ListedJob[] {
  let host = tenantHost(boardId, "jobs.personio.de")
  try {
    host = new URL(origin).host
  } catch {
    /* keep the .de host */
  }
  return tagBlocks(xml, "position").flatMap((position) => {
    const id = tagText(position, "id")
    const title = tagText(position, "name")
    if (!id || !title) return []
    const offices = [
      tagText(position, "office"),
      ...tagBlocks(position, "additionalOffices").map((block) => tagText(block, "office")),
    ].filter((value): value is string => Boolean(value))
    const descriptions = tagBlocks(position, "jobDescription")
      .map((block) => tagText(block, "value"))
      .filter((value): value is string => Boolean(value))
    const employment = [tagText(position, "employmentType"), tagText(position, "schedule")]
      .filter(Boolean)
      .join(", ")
    const location = offices.join(" | ") || undefined
    const description = descriptions.join("\n")
    const listed = buildListedJob({
      externalId: id,
      title,
      companyName,
      locationText: location,
      employmentType: employment || undefined,
      workplaceType: inferWorkplace(undefined, location, description),
      descriptionHtml: description || undefined,
      publishedAt: asDate(tagText(position, "createdAt")),
      originalUrl: `https://${host}/job/${encodeURIComponent(id)}`,
      sourceType: "PERSONIO",
      sourceBoardId: boardId,
    })
    return listed ? [listed] : []
  })
}

type SearchPosition = {
  id?: number | string
  name?: string
  employment_type?: string
  schedule?: string
  office?: string
  offices?: string[]
  subcompany?: string
}

/**
 * The career page's own search, for a tenant whose XML feed is off: live-nation.jobs.personio.de,
 * equipme and probonio answered 404 on /xml and 200 on /search.json, robots.txt "Allow: /"
 * (2026-11-03). It lists offices by city and has no description; the offer page has it.
 */
export function parsePersonioSearch(
  payload: unknown,
  boardId: string,
  host: string,
  companyName?: string
): { jobs: ListedJob[]; publishedName?: string } {
  if (!Array.isArray(payload)) return { jobs: [] }
  const positions = payload as SearchPosition[]
  const jobs = positions.flatMap((position) => {
    if (position.id == null || !position.name) return []
    const offices = [...new Set([position.office, ...(position.offices ?? [])].filter(Boolean))]
    const location = offices.join(" | ") || undefined
    const listed = buildListedJob({
      externalId: String(position.id),
      title: position.name,
      companyName,
      locationText: location,
      employmentType:
        [position.employment_type, position.schedule].filter(Boolean).join(", ") || undefined,
      workplaceType: inferWorkplace(undefined, location, ""),
      originalUrl: `https://${host}/job/${encodeURIComponent(String(position.id))}`,
      sourceType: "PERSONIO",
      sourceBoardId: boardId,
      needsHydration: true,
    })
    return listed ? [listed] : []
  })
  const publishedName = positions.map((position) => position.subcompany).find(Boolean)
  return { jobs, publishedName }
}

async function listPersonioSearch(
  host: string,
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList | null> {
  const robots = await http.get(`https://${host}/robots.txt`, { maxBytes: 200_000 })
  const rules = robots.status < 400 ? parseRobots(robots.body) : parseRobots("")
  if (!robotsAllows(rules, "/search.json")) return null
  const response = await http.get(`https://${host}/search.json`, {
    maxBytes: 8_000_000,
    accept: "application/json",
  })
  if (response.status >= 400) return null
  let payload: unknown
  try {
    payload = JSON.parse(response.body)
  } catch {
    return null
  }
  const { jobs, publishedName } = parsePersonioSearch(payload, boardId, host, companyName)
  if (!jobs.length) {
    return { jobs: [], proven: false, companyName, note: `Personio ${boardId} has no open jobs` }
  }
  return {
    jobs,
    proven: true,
    companyName,
    publishedName,
    note: "Personio XML feed is off; read the career page's search.json",
  }
}

export async function listPersonio(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const urls = personioFeedUrls(boardId)
  for (const [index, url] of urls.entries()) {
    const response = await http.get(url, {
      maxBytes: 8_000_000,
      accept: "application/xml, text/xml, */*;q=0.1",
    })
    if (response.status === 404 && index < urls.length - 1) continue
    if (response.status === 404) {
      // No XML feed on either domain: the career page's search may still list the jobs.
      for (const feed of urls) {
        const fallback = await listPersonioSearch(new URL(feed).host, boardId, http, companyName)
        if (fallback) return fallback
      }
      return { jobs: [], proven: false, companyName, note: `Personio ${boardId} was not found` }
    }
    if (response.status >= 400) throw new Error(`Personio ${boardId} returned ${response.status}`)
    const jobs = parsePersonioXml(response.body, boardId, response.url || url, companyName)
    if (jobs.length === 0)
      return { jobs: [], proven: false, companyName, note: `Personio ${boardId} has no open jobs` }
    // <subcompany> is the employer entity the tenant posts under ("Desotec NV").
    const publishedName = tagBlocks(response.body, "position")
      .map((position) => tagText(position, "subcompany"))
      .find((name): name is string => Boolean(name))
    return {
      jobs,
      proven: true,
      companyName,
      publishedName,
      note: companyName ? undefined : "Personio XML has no company name; identity is the slug",
    }
  }
  return { jobs: [], proven: false, companyName, note: `Personio ${boardId} was not found` }
}
