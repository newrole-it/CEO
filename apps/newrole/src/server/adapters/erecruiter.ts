import { z } from "zod"
import type { HttpClient } from "src/server/security/safe-fetch"
import type { ListedJob } from "src/shared/schemas"
import { namesAgree } from "./blocked"
import {
  allInnerHtmlOfId,
  innerHtmlOfId,
  metaContent,
  removeElementById,
  stripTags,
} from "./html-bits"
import { asDate, buildListedJob, itemsFrom, readJson } from "./parse"
import type { BoardList } from "./types"

/**
 * eRecruiter (Grupa Pracuj), the most used ATS in Poland. Two public hosting forms are read:
 *
 * 1. Career Sites Builder: `https://{slug}.pracujunas.pl/`. The page embeds a link to
 *    `offers.erecruiter.pl/skk/company/{id}/offers.json?hash=…` that returns every open offer
 *    with its description. Board id: the slug (e.g. "zabka").
 * 2. The "Strona Kariera" widget a company embeds on its own site:
 *    `skk.erecruiter.pl/Code.ashx?cfg={32-hex}`. The same cfg lists offer rows at
 *    `GetHtml.ashx?cfg=…&grid=rows&pn={page}` (15 a page, JSONP) without descriptions, and each
 *    `Offer.aspx` page carries the body. Board id: the cfg token.
 *
 * Both are undocumented and keyless. Verified on 2026-10-31 (zabka, Echo Investment).
 * `system.erecruiter.pl` apply forms stay link-only: that host disallows crawling.
 */

export const ERECRUITER_WIDGET_BASE = "https://skk.erecruiter.pl"
const WIDGET_PAGE_SIZE = 15
const WIDGET_MAX_PAGES = 40

export function isErecruiterCfg(boardId: string): boolean {
  return /^[0-9a-f]{32}$/i.test(boardId.trim())
}

export function pracujunasSlug(boardId: string): string {
  const trimmed = boardId.trim().toLowerCase()
  return trimmed
    .replace(/^https?:\/\//, "")
    .replace(/\.pracujunas\.pl.*$/, "")
    .replace(/\/.*$/, "")
}

export function pracujunasUrl(boardId: string): string {
  return `https://${pracujunasSlug(boardId)}.pracujunas.pl/`
}

export function erecruiterWidgetListUrl(cfg: string, page: number): string {
  return `${ERECRUITER_WIDGET_BASE}/GetHtml.ashx?cfg=${encodeURIComponent(
    cfg
  )}&grid=rows&pn=${page}`
}

/** The offers.json link embedded in a pracujunas.pl page, or null when the page has none. */
export function offersLinkFromPage(html: string): string | null {
  const direct = html.match(
    /https:\\?\/\\?\/offers\.erecruiter\.pl\\?\/skk\\?\/company\\?\/\d+\\?\/offers\.json\?hash=[0-9A-Fa-f]+/
  )
  if (direct) return direct[0].replace(/\\\//g, "/")
  return null
}

const salaryRangeSchema = z
  .object({
    min: z.coerce.number().nullable().optional(),
    max: z.coerce.number().nullable().optional(),
    from: z.coerce.number().nullable().optional(),
    to: z.coerce.number().nullable().optional(),
    currency: z.string().nullable().optional(),
    period: z.string().nullable().optional(),
    type: z.string().nullable().optional(),
  })
  .passthrough()

const offerSchema = z
  .object({
    title: z.string(),
    url: z.string().nullable().optional(),
    urlWithLayout: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    location: z.string().nullable().optional(),
    region: z.object({ name: z.string().nullable().optional() }).nullable().optional(),
    country: z.object({ isoCode: z.string().nullable().optional() }).nullable().optional(),
    publishDate: z.string().nullable().optional(),
    lastModificationDate: z.string().nullable().optional(),
    jobOfferId: z.union([z.string(), z.number()]).nullable().optional(),
    jobOfferRegionId: z.union([z.string(), z.number()]).nullable().optional(),
    uniqueId: z.string().nullable().optional(),
    positionDescription: z.string().nullable().optional(),
    requirements: z.string().nullable().optional(),
    opportunities: z.string().nullable().optional(),
    compensationPackage: z
      .object({ salaryRanges: z.array(z.unknown()).nullable().optional() })
      .nullable()
      .optional()
      .catch(null),
  })
  .passthrough()

function salaryText(ranges: unknown): string | undefined {
  if (!Array.isArray(ranges) || ranges.length === 0) return undefined
  const parts: string[] = []
  for (const range of itemsFrom(ranges, salaryRangeSchema)) {
    const min = range.min ?? range.from ?? null
    const max = range.max ?? range.to ?? null
    if (min == null && max == null) continue
    const span = min != null && max != null ? `${min}-${max}` : `${min ?? max}`
    parts.push(
      [span, range.currency ?? "PLN", range.period ?? range.type].filter(Boolean).join(" ")
    )
  }
  return parts.length ? parts.join("; ") : undefined
}

export function parseErecruiterOffers(
  payload: unknown,
  boardId: string,
  companyName?: string
): ListedJob[] {
  const root = z
    .object({ jobs: z.array(z.unknown()).optional() })
    .passthrough()
    .safeParse(payload)
  const list = root.success ? root.data.jobs ?? [] : []
  return itemsFrom(list, offerSchema).flatMap((offer) => {
    const url = offer.urlWithLayout || offer.url
    if (!url) return []
    const location = [offer.location, offer.region?.name]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
    if (offer.country?.isoCode && !location.some((part) => /poland|polska/i.test(part))) {
      location.push(offer.country.isoCode === "PL" ? "Poland" : offer.country.isoCode)
    }
    const description = [offer.positionDescription, offer.requirements, offer.opportunities]
      .filter(Boolean)
      .join("\n")
    const externalId =
      (offer.jobOfferRegionId != null && String(offer.jobOfferRegionId)) ||
      offer.uniqueId ||
      (offer.jobOfferId != null ? String(offer.jobOfferId) : undefined)
    const listed = buildListedJob({
      externalId: externalId || undefined,
      title: offer.title,
      companyName: offer.company?.trim() || companyName,
      locationText: location.join(", ") || undefined,
      descriptionHtml: description || undefined,
      salaryText: salaryText(offer.compensationPackage?.salaryRanges),
      publishedAt: asDate(offer.publishDate) ?? asDate(offer.lastModificationDate),
      originalUrl: url,
      sourceType: "ERECRUITER",
      sourceBoardId: boardId,
      needsHydration: false,
    })
    return listed ? [listed] : []
  })
}

export type WidgetRow = {
  offerId: string
  externalJobOfferId: string
  regionId: string
  companyId: string
  title: string
  city: string
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`\\b${name}=['"]([^'"]*)['"]`, "i"))
  return match?.[1]?.trim() ?? ""
}

/** The offer rows and the total the hidden marker row reports (-1 when absent). */
export function parseErecruiterWidgetRows(body: string): { rows: WidgetRow[]; total: number } {
  let text = body.trim().replace(/;$/, "")
  if (text.startsWith("(") && text.endsWith(")")) text = text.slice(1, -1)
  if (!text) return { rows: [], total: -1 }
  let html = ""
  try {
    const parsed = JSON.parse(text) as { htm?: unknown }
    html = typeof parsed.htm === "string" ? parsed.htm : ""
  } catch {
    return { rows: [], total: -1 }
  }
  const rows: WidgetRow[] = []
  let total = -1
  for (const match of html.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    const open = match[1]
    if (!/skkResult=['"]offer['"]/i.test(open)) {
      const marker = attr(open, "tr")
      if (/^\d+$/.test(marker)) total = Number(marker)
      continue
    }
    const offerId = attr(open, "offerId")
    if (!offerId) continue
    const cells = [...match[2].matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)]
    const titleCell = cells.find((cell) => /skk_positionName/i.test(cell[1]))
    const title = stripTags(titleCell?.[2] ?? cells[0]?.[2] ?? "")
    const city = stripTags(cells[cells.length - 1]?.[2] ?? "")
    rows.push({
      offerId,
      externalJobOfferId: attr(open, "externalJobOfferId"),
      regionId: attr(open, "externalJobOfferRegionId"),
      companyId: attr(open, "comId"),
      title,
      city: cells.length > 1 ? city : "",
    })
  }
  return { rows, total }
}

export function erecruiterOfferUrl(row: WidgetRow, cfg: string): string {
  const url = new URL(`${ERECRUITER_WIDGET_BASE}/Offer.aspx`)
  url.searchParams.set("oid", row.offerId)
  url.searchParams.set("cfg", cfg)
  if (row.externalJobOfferId) url.searchParams.set("ejoId", row.externalJobOfferId)
  if (row.regionId) url.searchParams.set("ejorId", row.regionId)
  if (row.companyId) url.searchParams.set("comId", row.companyId)
  return url.toString()
}

export function widgetRowToJob(
  row: WidgetRow,
  cfg: string,
  companyName?: string
): ListedJob | null {
  return buildListedJob({
    externalId: row.offerId,
    title: row.title,
    companyName,
    locationText: row.city || undefined,
    originalUrl: erecruiterOfferUrl(row, cfg),
    sourceType: "ERECRUITER",
    sourceBoardId: cfg,
    needsHydration: true,
  })
}

export type OfferDetail = {
  title?: string
  location?: string
  descriptionHtml?: string
  employer?: string
}

const BODY_IDS = ["t1", "Opportunities", "CompanyDescription", "opis", "description", "Notes"]

/** The offer page: header fields, the body without the header and GDPR clause, the employer. */
export function parseErecruiterOffer(html: string): OfferDetail {
  const title = stripTags(innerHtmlOfId(html, "JobTitle") ?? "") || undefined
  const workplace = stripTags(innerHtmlOfId(html, "WorkPlace") ?? "")
  const location =
    (workplace.includes(":") ? workplace.split(":").slice(1).join(":") : workplace).trim() ||
    undefined
  let body = ""
  const container = innerHtmlOfId(html, "offCont")
  if (container) {
    body = ["JobTitle", "WorkPlace", "Clause"].reduce(
      (rest, id) => removeElementById(rest, id),
      container
    )
    body = body.replace(/<a\b[^>]*RecruitmentForm\.aspx[^>]*>[\s\S]*?<\/a>/gi, "")
  }
  if (!stripTags(body)) {
    body = BODY_IDS.flatMap((id) => allInnerHtmlOfId(html, id)).join("\n")
  }
  const meta = metaContent(html, "name", "description") ?? ""
  const employer = meta.match(/^Praca w (.+?):/)?.[1]?.trim()
  return {
    title,
    location,
    descriptionHtml: stripTags(body) ? body : undefined,
    employer: employer || undefined,
  }
}

async function listFromCareerSite(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const slug = pracujunasSlug(boardId)
  if (!slug) return { jobs: [], proven: false, companyName, note: "eRecruiter board id is empty" }
  const page = await http.get(pracujunasUrl(slug), { accept: "text/html", maxBytes: 2_000_000 })
  if (page.status === 404)
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `eRecruiter site ${slug}.pracujunas.pl was not found`,
    }
  if (page.status >= 400) throw new Error(`eRecruiter site ${slug} returned ${page.status}`)
  const link = offersLinkFromPage(page.body)
  if (!link)
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `${slug}.pracujunas.pl has no offers.json link. It may not be an eRecruiter career site.`,
    }
  const response = await http.get(link, { accept: "application/json", maxBytes: 8_000_000 })
  if (response.status >= 400)
    throw new Error(`eRecruiter offers for ${slug} returned ${response.status}`)
  let payload: unknown
  try {
    payload = readJson(response.body)
  } catch {
    return {
      jobs: [],
      proven: false,
      companyName,
      note: `eRecruiter offers for ${slug} were not JSON`,
    }
  }
  const jobs = parseErecruiterOffers(payload, slug, companyName)
  const resolved = jobs.find((job) => job.companyName)?.companyName || companyName
  if (companyName && resolved && !namesAgree(companyName, resolved)) {
    return {
      jobs: [],
      proven: false,
      companyName: resolved,
      note: `eRecruiter site ${slug} is ${resolved}, not ${companyName}`,
    }
  }
  if (jobs.length === 0)
    return {
      jobs: [],
      proven: true,
      companyName: resolved,
      note: `eRecruiter site ${slug} has no open jobs`,
    }
  return { jobs, proven: true, companyName: resolved, complete: true }
}

async function listFromWidget(
  cfg: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  const rows: WidgetRow[] = []
  let total = -1
  for (let page = 1; page <= WIDGET_MAX_PAGES; page++) {
    const response = await http.get(erecruiterWidgetListUrl(cfg, page), {
      accept: "text/javascript, application/json, text/plain",
      maxBytes: 2_000_000,
    })
    if (response.status >= 400)
      throw new Error(`eRecruiter widget ${cfg} returned ${response.status}`)
    if (/nie istnieje/i.test(response.body) && page === 1) {
      return {
        jobs: [],
        proven: false,
        companyName,
        note: `eRecruiter widget ${cfg} does not exist`,
      }
    }
    const parsed = parseErecruiterWidgetRows(response.body)
    if (total < 0 && parsed.total >= 0) total = parsed.total
    if (parsed.rows.length === 0) break
    rows.push(...parsed.rows)
    if (total >= 0 && rows.length >= total) break
    if (parsed.rows.length < WIDGET_PAGE_SIZE) break
  }
  if (rows.length === 0)
    return {
      jobs: [],
      proven: true,
      companyName,
      note: `eRecruiter widget ${cfg} has no open jobs`,
    }
  let employer: string | undefined
  const first = await http.get(erecruiterOfferUrl(rows[0], cfg), {
    accept: "text/html",
    maxBytes: 2_000_000,
  })
  if (first.status < 400) employer = parseErecruiterOffer(first.body).employer
  if (companyName && employer && !namesAgree(companyName, employer)) {
    return {
      jobs: [],
      proven: false,
      companyName: employer,
      note: `eRecruiter widget ${cfg} belongs to ${employer}, not ${companyName}`,
    }
  }
  const resolved = employer || companyName
  const jobs = rows.flatMap((row) => {
    const job = widgetRowToJob(row, cfg, resolved)
    return job ? [job] : []
  })
  const capped = total > rows.length
  return {
    jobs,
    proven: true,
    companyName: resolved,
    listedCount: total > 0 ? total : jobs.length,
    complete: !capped,
    note: capped
      ? `Read ${rows.length} of ${total} offers. The rest follow on the next run.`
      : undefined,
  }
}

export async function listErecruiter(
  boardId: string,
  http: HttpClient,
  companyName?: string
): Promise<BoardList> {
  return isErecruiterCfg(boardId)
    ? listFromWidget(boardId.trim().toLowerCase(), http, companyName)
    : listFromCareerSite(boardId, http, companyName)
}

export async function hydrateErecruiter(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText || !/skk\.erecruiter\.pl\/Offer\.aspx/i.test(job.originalUrl)) return job
  const response = await http.get(job.originalUrl, { accept: "text/html", maxBytes: 2_000_000 })
  if (response.status >= 400) return job
  const detail = parseErecruiterOffer(response.body)
  if (!detail.descriptionHtml) return job
  const hydrated = buildListedJob({
    externalId: job.externalId,
    title: detail.title || job.title,
    companyName: job.companyName || detail.employer,
    locationText: detail.location || job.locationText,
    descriptionHtml: detail.descriptionHtml,
    publishedAt: job.publishedAt,
    originalUrl: job.originalUrl,
    sourceType: "ERECRUITER",
    sourceBoardId: job.sourceBoardId,
    needsHydration: false,
  })
  return hydrated ? { ...job, ...hydrated, needsHydration: false } : job
}
