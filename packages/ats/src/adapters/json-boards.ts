import type { HttpClient } from "../host"
import type { ListedJob, SourceType } from "../schemas"
import { tenantHost } from "./hosts"
import { parseJsonLdJobs } from "./jsonld"
import { asDate, buildListedJob, mapWorkplace, readJson } from "./parse"
import type { BoardList } from "./types"

/**
 * ATS vendors with a keyless JSON or feed listing. Undocumented unless noted; endpoints were
 * called live on 2026-10-31. Hydration reads the id from the stored URL, so it does not depend
 * on how the pipeline scopes externalId.
 */

type Row = Record<string, any>
type Listing = (board: string, http: HttpClient, name?: string) => Promise<BoardList>

class BoardMissing extends Error {}

async function getJson(
  http: HttpClient,
  url: string,
  label: string,
  headers?: Record<string, string>
): Promise<any> {
  const response = await http.get(url, { accept: "application/json", maxBytes: 8_000_000, headers })
  if (response.status === 404 || response.status === 410 || response.status === 422) {
    throw new BoardMissing(`${label} was not found`)
  }
  if (response.status >= 400) throw new Error(`${label} returned ${response.status}`)
  try {
    return readJson(response.body)
  } catch {
    throw new BoardMissing(`${label} did not return JSON`)
  }
}

function joinText(...parts: Array<unknown>): string | undefined {
  const text = parts.filter((part) => typeof part === "string" && part.trim()).join("\n")
  return text || undefined
}

function place(...parts: Array<unknown>): string | undefined {
  const seen = parts.filter(
    (part): part is string => typeof part === "string" && Boolean(part.trim())
  )
  return [...new Set(seen.map((part) => part.trim()))].join(", ") || undefined
}

function result(
  label: string,
  jobs: Array<ListedJob | null>,
  name?: string,
  total?: number
): BoardList {
  const kept = jobs.filter((job): job is ListedJob => Boolean(job))
  const companyName = kept.find((job) => job.companyName)?.companyName || name
  if (kept.length === 0)
    return { jobs: [], proven: true, companyName, note: `${label} has no open jobs` }
  return { jobs: kept, proven: true, companyName, listedCount: total ?? kept.length }
}

function guarded(list: Listing): Listing {
  return async (board, http, name) => {
    try {
      return await list(board, http, name)
    } catch (error) {
      if (error instanceof BoardMissing) {
        return { jobs: [], proven: false, companyName: name, note: error.message }
      }
      throw error
    }
  }
}

function withBody(job: ListedJob, source: SourceType, html: unknown, title?: string): ListedJob {
  if (typeof html !== "string" || !html.trim()) return job
  const built = buildListedJob({
    externalId: job.externalId,
    title: title || job.title,
    companyName: job.companyName,
    locationText: job.locationText,
    employmentType: job.employmentType,
    workplaceType: job.workplaceType,
    descriptionHtml: html,
    salaryText: job.salaryText,
    publishedAt: job.publishedAt,
    originalUrl: job.originalUrl,
    sourceType: source,
    sourceBoardId: job.sourceBoardId,
    needsHydration: false,
  })
  return built ? { ...job, ...built, needsHydration: false } : job
}

function lastSegment(url: string): string {
  return new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
}

// Eightfold: board "host/domain", e.g. "jobs.ericsson.com/ericsson.com". Page size is capped at 10.
export function parseEightfold(payload: Row, board: string, name?: string): ListedJob[] {
  const host = board.split("/")[0]
  return (payload?.data?.positions ?? []).map((row: Row) => {
    const location = (row.standardizedLocations ?? row.locations ?? []).join("; ") || undefined
    return buildListedJob({
      externalId: String(row.id),
      title: row.name ?? "",
      companyName: name,
      locationText: location,
      workplaceType: mapWorkplace(row.workLocationOption, location),
      publishedAt: asDate(Number(row.postedTs)),
      originalUrl: new URL(
        row.positionUrl ?? `/careers/job/${row.id}`,
        `https://${host}`
      ).toString(),
      sourceType: "EIGHTFOLD",
      sourceBoardId: board,
      needsHydration: true,
    })
  })
}

export const listEightfold = guarded(async (board, http, name) => {
  const [host, domain] = board.split("/")
  if (!host || !domain) throw new BoardMissing(`Eightfold board ${board} must be host/domain`)
  const jobs: Array<ListedJob | null> = []
  let total = 0
  for (let start = 0; start < 500; start += 10) {
    const url = `https://${host}/api/pcsx/search?domain=${encodeURIComponent(
      domain
    )}&query=&location=Poland&start=${start}&num=10&sort_by=timestamp`
    const payload = await getJson(http, url, `Eightfold ${host}`)
    if (!payload?.data) throw new BoardMissing(`Eightfold ${host} answered without data`)
    total = Number(payload.data.count ?? total)
    const page = parseEightfold(payload, board, name)
    jobs.push(...page)
    if (page.length < 10) break
  }
  return result(`Eightfold ${host}`, jobs, name, total || undefined)
})

export async function hydrateEightfold(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  const [host, domain] = (job.sourceBoardId ?? "").split("/")
  if (!host || !domain) return job
  const url = `https://${host}/api/pcsx/position_details?domain=${encodeURIComponent(
    domain
  )}&position_id=${lastSegment(job.originalUrl)}`
  const payload = await getJson(http, url, `Eightfold ${host}`).catch(() => null)
  return withBody(job, "EIGHTFOLD", payload?.data?.jobDescription)
}

// Softgarden: board is the tenant of {tenant}.career.softgarden.de, or a custom host.
export const listSoftgarden = guarded(async (board, http, name) => {
  const host = tenantHost(board, "career.softgarden.de")
  const payload = await getJson(http, `https://${host}/jobs.feed.json`, `Softgarden ${host}`)
  const jobs = ((payload.dataFeedElement ?? []) as Row[]).flatMap((element) => {
    const script = `<script type="application/ld+json">${JSON.stringify(element.item ?? {}).replace(
      /</g,
      "\\u003c"
    )}</script>`
    return parseJsonLdJobs(script, element.item?.url ?? `https://${host}/`, name, {
      provider: "softgarden",
      sourceType: "SOFTGARDEN",
      boardId: board,
      fullText: true,
    })
  })
  return result(`Softgarden ${host}`, jobs, name)
})

// Bullhorn (documented): board "swimlane/corpToken". Agency portals vary, so the link is the public record.
export const listBullhorn = guarded(async (board, http, name) => {
  const [swimlane, token] = board.split("/")
  if (!swimlane || !token) throw new BoardMissing(`Bullhorn board ${board} must be swimlane/token`)
  const base = `https://public-rest${swimlane}.bullhornstaffing.com/rest-services/${token}`
  const fields =
    "id,title,publicDescription,address(city,state,countryName),dateAdded,employmentType"
  const jobs: Array<ListedJob | null> = []
  let total = 0
  for (let start = 0; start < 5000; start += 500) {
    const payload = await getJson(
      http,
      `${base}/search/JobOrder?query=(isOpen:1)&fields=${fields}&count=500&start=${start}&sort=-dateLastPublished`,
      `Bullhorn ${board}`
    )
    total = Number(payload.total ?? 0)
    const rows = (payload.data ?? []) as Row[]
    for (const row of rows) {
      jobs.push(
        buildListedJob({
          externalId: String(row.id),
          title: row.title ?? "",
          companyName: name,
          locationText: place(row.address?.city, row.address?.state, row.address?.countryName),
          employmentType: row.employmentType,
          descriptionHtml: row.publicDescription ?? undefined,
          publishedAt: asDate(row.dateAdded),
          originalUrl: `${base}/entity/JobOrder/${row.id}?fields=id,title,publicDescription`,
          sourceType: "BULLHORN",
          sourceBoardId: board,
        })
      )
    }
    if (rows.length < 500) break
  }
  return result(`Bullhorn ${board}`, jobs, name, total)
})

// Zoho Recruit: board is the tenant, or a full host for the .eu data centre.
export const listZoho = guarded(async (board, http, name) => {
  const host = tenantHost(board, "zohorecruit.com")
  const payload = await getJson(
    http,
    `https://${host}/recruit/v2/public/Job_Openings?pagename=Careers&source=CareerSite`,
    `Zoho ${host}`
  )
  const jobs = ((payload.data ?? []) as Row[]).map((row) => {
    const location = place(row.City, row.State, row.Country)
    return buildListedJob({
      externalId: String(row.id),
      title: row.Posting_Title ?? row.Job_Opening_Name ?? "",
      companyName: name,
      locationText: location,
      employmentType: row.Job_Type,
      workplaceType: row.Remote_Job === true ? "REMOTE" : undefined,
      descriptionHtml: row.Job_Description ?? undefined,
      publishedAt: asDate(row.Date_Opened),
      originalUrl: row.$url ?? `https://${host}/jobs/Careers/${row.id}`,
      sourceType: "ZOHO_RECRUIT",
      sourceBoardId: board,
    })
  })
  return result(`Zoho ${host}`, jobs, name)
})

// Rippling: board is the slug.
const RIPPLING = "https://api.rippling.com/platform/api/ats/v1/board"
export const listRippling = guarded(async (board, http, name) => {
  const rows = (await getJson(
    http,
    `${RIPPLING}/${encodeURIComponent(board)}/jobs`,
    `Rippling ${board}`
  )) as Row[]
  const jobs = rows.map((row) =>
    buildListedJob({
      externalId: row.uuid,
      title: row.name ?? "",
      companyName: name,
      locationText: row.workLocation?.label,
      originalUrl: row.url,
      sourceType: "RIPPLING",
      sourceBoardId: board,
      needsHydration: true,
    })
  )
  return result(`Rippling ${board}`, jobs, name)
})

export async function hydrateRippling(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  const url = `${RIPPLING}/${job.sourceBoardId}/jobs/${lastSegment(job.originalUrl)}`
  const payload = await getJson(http, url, "Rippling").catch(() => null)
  return withBody(
    job,
    "RIPPLING",
    joinText(payload?.description?.role, payload?.description?.company)
  )
}

// Gem (documented): board is the vanity slug.
export const listGem = guarded(async (board, http, name) => {
  const rows = (await getJson(
    http,
    `https://api.gem.com/job_board/v0/${encodeURIComponent(board)}/job_posts/`,
    `Gem ${board}`
  )) as Row[]
  const jobs = rows.map((row) =>
    buildListedJob({
      externalId: String(row.id),
      title: row.title ?? "",
      companyName: name,
      locationText: row.location?.name,
      employmentType: row.employment_type,
      workplaceType: mapWorkplace(row.location_type, row.location?.name),
      descriptionHtml: row.content ?? undefined,
      publishedAt: asDate(row.first_published_at),
      originalUrl: row.absolute_url,
      sourceType: "GEM",
      sourceBoardId: board,
    })
  )
  return result(`Gem ${board}`, jobs, name)
})

// Dover: board is the careers-page slug, resolved to a client id.
const DOVER = "https://app.dover.com/api/v1"
export const listDover = guarded(async (board, http, name) => {
  const client = await getJson(
    http,
    `${DOVER}/careers-page-slug/${encodeURIComponent(board)}`,
    `Dover ${board}`
  )
  if (!client?.id) throw new BoardMissing(`Dover ${board} was not found`)
  const payload = await getJson(
    http,
    `${DOVER}/careers-page/${client.id}/jobs?limit=300&offset=0`,
    `Dover ${board}`
  )
  const rows = ((payload.results ?? []) as Row[]).filter(
    (row) => row.is_published !== false && !row.is_sample
  )
  const jobs = rows.map((row) => {
    const location =
      ((row.locations ?? []) as Row[])
        .map((item) => item.location_option?.display_name)
        .filter(Boolean)
        .join("; ") || undefined
    return buildListedJob({
      externalId: row.id,
      title: row.title ?? "",
      companyName: name,
      locationText: location,
      workplaceType: mapWorkplace(row.workplace_type, location),
      originalUrl: `https://app.dover.com/apply/${board}/${row.id}`,
      sourceType: "DOVER",
      sourceBoardId: board,
      needsHydration: true,
    })
  })
  return result(`Dover ${board}`, jobs, name, payload.count)
})

export async function hydrateDover(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  const payload = await getJson(
    http,
    `${DOVER}/inbound/application-portal-job/${lastSegment(job.originalUrl)}`,
    "Dover"
  ).catch(() => null)
  return withBody(job, "DOVER", payload?.user_provided_description)
}

// Polymer (documented, meant for job boards): board is the organization slug.
const POLYMER = "https://api.polymer.co/v1/hire/organizations"
export const listPolymer = guarded(async (board, http, name) => {
  const jobs: Array<ListedJob | null> = []
  for (let page = 1; page <= 30; page++) {
    const payload = await getJson(
      http,
      `${POLYMER}/${encodeURIComponent(board)}/jobs?page=${page}`,
      `Polymer ${board}`
    )
    for (const row of (payload.items ?? []) as Row[]) {
      const location = place(row.city, row.state_region, row.country)
      jobs.push(
        buildListedJob({
          externalId: String(row.id),
          title: row.title ?? "",
          companyName: row.organization_name ?? name,
          locationText: location,
          workplaceType: mapWorkplace(row.remoteness_pretty, location),
          publishedAt: asDate(row.published_at),
          originalUrl: `https://jobs.polymer.co/${board}/${row.id}`,
          sourceType: "POLYMER",
          sourceBoardId: board,
          needsHydration: true,
        })
      )
    }
    if (payload.meta?.is_last !== false) break
  }
  return result(`Polymer ${board}`, jobs, name)
})

export async function hydratePolymer(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  const payload = await getJson(
    http,
    `${POLYMER}/${job.sourceBoardId}/jobs/${lastSegment(job.originalUrl)}`,
    "Polymer"
  ).catch(() => null)
  return withBody(job, "POLYMER", payload?.description)
}

// Comeet (documented): board "uid/token"; the token is public in the company's career page.
export const listComeet = guarded(async (board, http, name) => {
  const [uid, token] = board.split("/")
  if (!uid || !token) throw new BoardMissing(`Comeet board ${board} must be uid/token`)
  const rows = (await getJson(
    http,
    `https://www.comeet.co/careers-api/2.0/company/${uid}/positions?token=${token}&details=true`,
    `Comeet ${uid}`
  )) as Row[]
  const jobs = rows.map((row) => {
    const location = place(row.location?.city, row.location?.name, row.location?.country)
    return buildListedJob({
      externalId: row.uid,
      title: row.name ?? "",
      companyName: row.company_name ?? name,
      locationText: location,
      employmentType: row.employment_type,
      workplaceType: row.location?.is_remote
        ? "REMOTE"
        : mapWorkplace(row.workplace_type, location),
      descriptionHtml: joinText(...((row.details ?? []) as Row[]).map((item) => item.value)),
      publishedAt: asDate(row.time_updated),
      originalUrl: row.url_active_page ?? row.url_comeet_hosted_page,
      sourceType: "COMEET",
      sourceBoardId: board,
    })
  })
  return result(`Comeet ${uid}`, jobs, name)
})

// d.vinci: board is the slug of {slug}.dvinci-hr.com, or a full host.
export const listDvinci = guarded(async (board, http, name) => {
  const host = tenantHost(board, "dvinci-hr.com")
  const rows = (await getJson(
    http,
    `https://${host}/jobPublication/list.json?lang=en`,
    `d.vinci ${host}`
  )) as Row[]
  const jobs = rows.map((row) =>
    buildListedJob({
      externalId: String(row.id),
      title: row.position ?? "",
      companyName: name,
      descriptionHtml: joinText(row.introduction, row.tasks, row.profile, row.weOffer),
      publishedAt: asDate(row.startDate),
      originalUrl: row.jobPublicationURL,
      sourceType: "DVINCI",
      sourceBoardId: board,
    })
  )
  return result(`d.vinci ${host}`, jobs, name)
})

// Manatal (documented): board is the career page slug.
export const listManatal = guarded(async (board, http, name) => {
  const jobs: Array<ListedJob | null> = []
  for (let page = 1; page <= 40; page++) {
    const payload = await getJson(
      http,
      `https://api.careers-page.com/open/v1/career-pages/${encodeURIComponent(
        board
      )}/job-posts?page=${page}&size=50`,
      `Manatal ${board}`
    )
    for (const row of (payload.items ?? []) as Row[]) {
      const text =
        row.translations?.find((item: Row) => item.language_code === "en") ?? row.translations?.[0]
      jobs.push(
        buildListedJob({
          externalId: String(row.id),
          title: text?.name ?? "",
          companyName: name,
          locationText: place(row.location?.city, row.location?.state, row.location?.country),
          descriptionHtml: text?.description ?? undefined,
          originalUrl: `https://www.careers-page.com/${board}/job/${row.id}`,
          sourceType: "MANATAL",
          sourceBoardId: board,
        })
      )
    }
    if (page >= Number(payload.pages ?? 1)) break
  }
  return result(`Manatal ${board}`, jobs, name)
})

// Homerun: board is the slug; an Atom feed with the body in each entry.
export function parseHomerunFeed(xml: string, board: string, name?: string): ListedJob[] {
  const read = (block: string, tag: string) => {
    const raw = block.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"))?.[1] ?? ""
    return raw.replace(/^\s*<!\[CDATA\[([\s\S]*)\]\]>\s*$/, "$1").trim()
  }
  return [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].flatMap((entry) => {
    const link = entry[1].match(/<link\b[^>]*href="([^"]+)"/i)?.[1]
    if (!link) return []
    const job = buildListedJob({
      externalId: read(entry[1], "id") || link,
      title: read(entry[1], "title"),
      companyName: name,
      descriptionHtml: read(entry[1], "content") || read(entry[1], "summary") || undefined,
      publishedAt: asDate(read(entry[1], "updated")),
      originalUrl: link.replace(/&amp;/g, "&"),
      sourceType: "HOMERUN",
      sourceBoardId: board,
    })
    return job ? [job] : []
  })
}

export const listHomerun = guarded(async (board, http, name) => {
  const response = await http.get(`https://feed.homerun.co/${encodeURIComponent(board)}`, {
    accept: "application/atom+xml, application/xml",
    maxBytes: 8_000_000,
  })
  if (response.status >= 400 || /404\.homerun\.co/.test(response.url))
    throw new BoardMissing(`Homerun ${board} was not found`)
  return result(`Homerun ${board}`, parseHomerunFeed(response.body, board, name), name)
})
