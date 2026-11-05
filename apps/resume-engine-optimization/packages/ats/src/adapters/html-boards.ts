import type { HttpClient } from "../host"
import type { ListedJob, SourceType } from "../schemas"
import { parseSitemap } from "../crawler/sitemap"
import { decodeEntities } from "@newrole/offers/text"
import { tenantHost } from "./hosts"
import { metaContent, stripTags, titleFromSlug } from "./html-bits"
import { parseJsonLdJobs } from "./jsonld"
import { buildListedJob } from "./parse"
import type { BoardList } from "./types"

/**
 * ATS vendors with no public JSON: a server-rendered list or sitemap gives the links, and each
 * job page gives the body through JSON-LD, or its meta description when it has none.
 */

type HtmlVendor = {
  label: string
  sourceType: SourceType
  /** Page numbers count from 0. Null ends the walk. */
  listUrl: (board: string, page: number) => string | null
  jobLink: RegExp
  /** The list is a sitemap, so titles come from the URL slug. */
  sitemap?: boolean
}

export const HTML_VENDORS: Record<string, HtmlVendor> = {
  ONLYFY: {
    label: "onlyfy",
    sourceType: "ONLYFY",
    listUrl: (board, page) =>
      `https://${tenantHost(board, "onlyfy.jobs")}/candidate/job/ajax_list?display_length=50&page=${
        page + 1
      }`,
    jobLink: /\/job\/([a-z0-9]+)(?:["'?#/]|$)/i,
  },
  REXX: {
    label: "rexx",
    sourceType: "REXX",
    listUrl: (board, page) => `https://${board}/stellenangebote.html?start=${page * 100}`,
    jobLink: /-[a-z]{2,3}-j(\d+)\.html/i,
  },
  JAZZHR: {
    label: "JazzHR",
    sourceType: "JAZZHR",
    listUrl: (board, page) =>
      page ? null : `https://${tenantHost(board, "applytojob.com")}/apply/`,
    jobLink: /\/apply\/([A-Za-z0-9]{6,})\/[^"'?#]+/,
  },
  CATSONE: {
    label: "CATS",
    sourceType: "CATSONE",
    listUrl: (board, page) =>
      page ? null : `https://${tenantHost(board, "catsone.com")}/careers/`,
    jobLink: /\/careers\/\d+\/jobs\/(\d+)/,
  },
  LOXO: {
    label: "Loxo",
    sourceType: "LOXO",
    listUrl: (board, page) => (page ? null : `https://app.loxo.co/${encodeURIComponent(board)}`),
    jobLink: /\/job\/([A-Za-z0-9=_-]+)/,
  },
  TALENTLYFT: {
    label: "TalentLyft",
    sourceType: "TALENTLYFT",
    listUrl: (board, page) =>
      page ? null : `https://${tenantHost(board, "talentlyft.com")}/sitemap.xml`,
    jobLink: /\/jobs\/.+-([A-Za-z0-9]{3,})\/?$/,
    sitemap: true,
  },
  FACTORIAL: {
    label: "Factorial",
    sourceType: "FACTORIAL",
    listUrl: (board, page) =>
      page ? null : `https://${tenantHost(board, "factorialhr.com")}/sitemap.xml`,
    jobLink: /\/job_posting\/.*-(\d+)\/?$/,
    sitemap: true,
  },
}

export function parseHtmlListing(
  html: string,
  pageUrl: string,
  vendor: HtmlVendor
): Array<{ url: string; id: string; title: string }> {
  const out = new Map<string, { url: string; id: string; title: string }>()
  for (const anchor of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(anchor[1])
    const id = href.match(vendor.jobLink)?.[1]
    const title = stripTags(anchor[2])
    if (!id || !title || out.has(id)) continue
    try {
      out.set(id, { url: new URL(href, pageUrl).toString(), id, title })
    } catch {
      continue
    }
  }
  return [...out.values()]
}

function slugTitle(url: string): string {
  const last = new URL(url).pathname.split("/").filter(Boolean).pop() ?? ""
  return titleFromSlug(last.replace(/-[A-Za-z0-9]*\d[A-Za-z0-9]*$/, ""))
}

export function htmlLister(key: keyof typeof HTML_VENDORS & string) {
  const vendor = HTML_VENDORS[key]
  return async (board: string, http: HttpClient, name?: string): Promise<BoardList> => {
    const label = `${vendor.label} ${board}`
    const found = new Map<string, { url: string; id: string; title: string }>()
    for (let page = 0; page < 30; page++) {
      const url = vendor.listUrl(board, page)
      if (!url) break
      const response = await http.get(url, {
        accept: "text/html, application/xml",
        maxBytes: 6_000_000,
      })
      if (response.status === 404 || response.status === 410) {
        if (page === 0)
          return { jobs: [], proven: false, companyName: name, note: `${label} was not found` }
        break
      }
      if (response.status >= 400) throw new Error(`${label} returned ${response.status}`)
      const rows = vendor.sitemap
        ? parseSitemap(response.body).urls.flatMap((entry) => {
            const id = entry.loc.match(vendor.jobLink)?.[1]
            return id ? [{ url: entry.loc, id, title: slugTitle(entry.loc) }] : []
          })
        : parseHtmlListing(response.body, response.url || url, vendor)
      const before = found.size
      for (const row of rows) if (!found.has(row.id)) found.set(row.id, row)
      if (found.size === before) break
    }
    const jobs = [...found.values()].flatMap((row) => {
      const job = buildListedJob({
        externalId: row.id,
        title: row.title,
        companyName: name,
        originalUrl: row.url,
        sourceType: vendor.sourceType,
        sourceBoardId: board,
        needsHydration: true,
      })
      return job ? [job] : []
    })
    return jobs.length
      ? { jobs, proven: true, companyName: name, listedCount: jobs.length }
      : { jobs: [], proven: false, companyName: name, note: `${label} rendered no job links` }
  }
}

export async function hydrateHtmlJob(job: ListedJob, http: HttpClient): Promise<ListedJob> {
  if (job.descriptionText) return job
  const response = await http.get(job.originalUrl, { accept: "text/html", maxBytes: 3_000_000 })
  if (response.status >= 400) return job
  const found = parseJsonLdJobs(response.body, job.originalUrl, job.companyName, {
    provider: "html-board",
    sourceType: job.sourceType,
    boardId: job.sourceBoardId,
    fullText: true,
  })[0]
  if (found?.descriptionText) {
    return {
      ...job,
      ...found,
      externalId: job.externalId,
      originalUrl: job.originalUrl,
      companyName: job.companyName || found.companyName,
      needsHydration: false,
    }
  }
  const summary =
    metaContent(response.body, "property", "og:description") ??
    metaContent(response.body, "name", "description")
  return summary ? { ...job, descriptionText: summary, needsHydration: false } : job
}
