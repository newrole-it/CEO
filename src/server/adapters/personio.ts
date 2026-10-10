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
    if (response.status === 404)
      return { jobs: [], proven: false, companyName, note: `Personio ${boardId} was not found` }
    if (response.status >= 400) throw new Error(`Personio ${boardId} returned ${response.status}`)
    const jobs = parsePersonioXml(response.body, boardId, response.url || url, companyName)
    if (jobs.length === 0)
      return { jobs: [], proven: false, companyName, note: `Personio ${boardId} has no open jobs` }
    return {
      jobs,
      proven: true,
      companyName,
      note: companyName ? undefined : "Personio XML has no company name; identity is the slug",
    }
  }
  return { jobs: [], proven: false, companyName, note: `Personio ${boardId} was not found` }
}
