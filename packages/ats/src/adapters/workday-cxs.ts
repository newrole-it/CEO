/**
 * A Workday tenant's whole inventory from its career site's own job search, `/wday/cxs/`.
 *
 * Measured 2026-11-03 with NewRoleBot:
 * - robots.txt on Workday hosts disallows only `/refreshFacet/` (intive.wd3, motorolasolutions.wd5,
 *   accenture.wd103), so the search path is allowed; the sitemap stops at 100 URLs (Visa: 100 of 816).
 * - The search answers 20 postings a page and gives `total` on the first page only.
 * - It stops at 2,000: Accenture reports total 2000 while its facets add up to 41,530, and every
 *   offset from 2000 on returns the first page again.
 * So a tenant under 2,000 is read page by page, and a larger one is split by its facets (country
 * first, then area of work or city) until every slice fits. A country slice also says where its
 * postings are, so a posting listed as "2 Locations" gets its countries without a detail request.
 */
import { envCount } from "../env"
import type { RobotsRules } from "@newrole/offers/robots"
import { robotsAllows } from "@newrole/offers/robots"
import type { HttpClient } from "../host"
import { UnsafeUrlError } from "@newrole/offers/url-safety"
import type { ListedJob } from "../schemas"
import { buildListedJob } from "./parse"
import type { BoardList } from "./types"

export const CXS_PAGE_SIZE = 20
/** The search returns nothing new past this many results. */
export const CXS_RESULT_CAP = 2000

/**
 * Search requests one read may spend on one tenant, at 1 s each. Accenture (41,530 postings) took
 * 2,107 requests to reach 33,623 of them with three levels of slices (2026-11-03).
 */
function requestCap(): number {
  return envCount("WORKDAY_CXS_MAX_REQUESTS", 5000)
}

export type CxsTarget = {
  tenant: string
  cluster: string
  site: string
  host: string
  boardId: string
  companyName: string
}

export type CxsPosting = {
  title?: string
  externalPath?: string
  locationsText?: string
  postedOn?: string
  bulletFields?: string[]
}

type FacetValue = { descriptor?: string; id?: string; count?: number }
export type CxsFacet = {
  facetParameter?: string
  descriptor?: string
  values?: Array<FacetValue & { facetParameter?: string; values?: FacetValue[] }>
}

type SearchPage = { total?: number; jobPostings?: CxsPosting[]; facets?: CxsFacet[] }

/** One facet's values, whether it sits at the top or inside a group (locationMainGroup). */
export function facetValues(facets: CxsFacet[], parameter: string): FacetValue[] {
  for (const facet of facets) {
    if (facet.facetParameter === parameter) return (facet.values ?? []).filter((v) => v.id)
    for (const group of facet.values ?? []) {
      if (group.facetParameter === parameter) return (group.values ?? []).filter((v) => v.id)
    }
  }
  return []
}

/**
 * The facet to split a slice by: the first one, in order of preference, whose values cover the
 * slice. Country comes first because it also places the postings.
 */
const SPLIT_ORDER = ["locationCountry", "jobFamilyGroup", "locations", "timeType", "workerSubType"]

export function splitFacet(
  facets: CxsFacet[],
  sliceTotal: number,
  used: string[]
): { parameter: string; values: FacetValue[] } | null {
  for (const parameter of SPLIT_ORDER) {
    if (used.includes(parameter)) continue
    const values = facetValues(facets, parameter)
    if (values.length < 2) continue
    const sum = values.reduce((total, value) => total + (value.count ?? 0), 0)
    // A facet that leaves postings out (no country on 498 of Accenture's 41,530) still splits; the
    // unfiltered pages pick up the rest as far as the cap allows.
    if (sum >= sliceTotal * 0.9) return { parameter, values }
  }
  return null
}

/** "Posted Today", "Posted Yesterday", "Posted 5 Days Ago". "Posted 30+ Days Ago" says too little. */
export function postedFromText(text: string | undefined, now: Date): Date | undefined {
  const value = (text || "").toLowerCase()
  const day = 24 * 60 * 60 * 1000
  if (/posted today/.test(value)) return now
  if (/posted yesterday/.test(value)) return new Date(now.getTime() - day)
  const days = value.match(/posted (\d+) days? ago/)
  if (days && !/\+/.test(value)) return new Date(now.getTime() - Number(days[1]) * day)
  return undefined
}

/** The requisition id at the end of the path ("…/Business-System-Analyst_R69607-1"). */
export function externalIdFromPath(path: string): string {
  const last = path.split("/").filter(Boolean).pop() ?? path
  const id = last.includes("_") ? last.slice(last.lastIndexOf("_") + 1) : last
  return id || path
}

/** "930000 Motorola Solutions Norway AS" → "Motorola Solutions Norway AS". */
export function cleanOrganisation(name: string | undefined): string | undefined {
  const text = (name || "").replace(/^[\d\s_-]+(?=\p{L})/u, "").trim()
  return text && /\p{L}/u.test(text) ? text : undefined
}

/** A posting the list shows with more places than its text names ("2 Locations", "…, More..."). */
export function hasMorePlaces(locationsText: string | undefined): boolean {
  return /\b\d+ locations\b|more\.\.\./i.test(locationsText || "")
}

class RequestCapReached extends Error {}

type Collected = { posting: CxsPosting; countries: Set<string>; places?: string[] }

type PostingDetail = {
  hiringOrganization?: { name?: string }
  jobPostingInfo?: {
    location?: string
    additionalLocations?: string[] | null
    country?: { descriptor?: string; alpha2Code?: string }
    jobRequisitionLocation?: { country?: { descriptor?: string; alpha2Code?: string } }
  }
}

export async function listWorkdayCxs(
  target: CxsTarget,
  http: HttpClient,
  rules: RobotsRules,
  now = new Date()
): Promise<BoardList | null> {
  const path = `/wday/cxs/${target.tenant}/${target.site}/jobs`
  if (!http.post || !robotsAllows(rules, path)) return null
  const endpoint = `https://${target.host}${path}`
  const cap = requestCap()
  let requests = 0

  async function search(
    appliedFacets: Record<string, string[]>,
    offset: number
  ): Promise<SearchPage | null> {
    if (requests >= cap) throw new RequestCapReached()
    requests += 1
    const response = await http.post(
      endpoint,
      JSON.stringify({ limit: CXS_PAGE_SIZE, offset, appliedFacets, searchText: "" }),
      {
        accept: "application/json",
        maxBytes: 2_000_000,
        headers: { "Content-Type": "application/json" },
      }
    )
    if (response.status >= 400) return null
    try {
      return JSON.parse(response.body) as SearchPage
    } catch {
      return null
    }
  }

  /** One posting's own page in the search: every place it names, and its hiring organisation. */
  async function detail(externalPath: string): Promise<PostingDetail | null> {
    if (requests >= cap) throw new RequestCapReached()
    requests += 1
    const response = await http.get(
      `https://${target.host}/wday/cxs/${target.tenant}/${target.site}${externalPath}`,
      { accept: "application/json", maxBytes: 1_000_000 }
    )
    if (response.status >= 400) return null
    try {
      return JSON.parse(response.body) as PostingDetail
    } catch {
      return null
    }
  }

  const collected = new Map<string, Collected>()
  let complete = true
  let slices = 0

  function keep(postings: CxsPosting[], country?: string) {
    for (const posting of postings) {
      if (!posting.title || !posting.externalPath) continue
      const entry = collected.get(posting.externalPath) ?? { posting, countries: new Set<string>() }
      if (country) entry.countries.add(country)
      collected.set(posting.externalPath, entry)
    }
  }

  /** Every page of one slice that is under the cap. */
  async function sweep(
    appliedFacets: Record<string, string[]>,
    first: SearchPage,
    count: number,
    country?: string
  ) {
    slices += 1
    keep(first.jobPostings ?? [], country)
    const pages = Math.ceil(Math.min(count, CXS_RESULT_CAP) / CXS_PAGE_SIZE)
    for (let page = 1; page < pages; page += 1) {
      const next = await search(appliedFacets, page * CXS_PAGE_SIZE)
      if (!next) {
        complete = false
        return
      }
      const postings = next.jobPostings ?? []
      if (!postings.length) return
      keep(postings, country)
    }
  }

  /** A slice over the cap is split by a facet it has not used yet; one that cannot be split is read as far as the cap. */
  async function read(
    appliedFacets: Record<string, string[]>,
    first: SearchPage,
    count: number,
    used: string[],
    country?: string
  ): Promise<void> {
    if (count < CXS_RESULT_CAP) return sweep(appliedFacets, first, count, country)
    const split = splitFacet(first.facets ?? [], count, used)
    // Four levels: Accenture's Bengaluru software postings still ran past 2,000 after country,
    // area of work and city.
    if (!split || used.length >= 4) {
      complete = false
      return sweep(appliedFacets, first, count, country)
    }
    for (const value of split.values) {
      if (!value.id || !value.count) continue
      const facets = { ...appliedFacets, [split.parameter]: [value.id] }
      const page = await search(facets, 0)
      if (!page) {
        complete = false
        continue
      }
      const sliceCountry =
        split.parameter === "locationCountry" ? value.descriptor ?? country : country
      await read(facets, page, value.count, [...used, split.parameter], sliceCountry)
    }
  }

  let first: SearchPage | null
  try {
    first = await search({}, 0)
  } catch (error) {
    if (error instanceof UnsafeUrlError) return null
    throw error
  }
  if (!first) return null
  const total = first.total ?? 0
  const facets = first.facets ?? []
  // The real size, which the capped total hides: the largest facet sum that does not double count.
  const realTotal = Math.max(
    total,
    ...["timeType", "jobFamilyGroup"].map((parameter) =>
      facetValues(facets, parameter).reduce((sum, value) => sum + (value.count ?? 0), 0)
    )
  )
  try {
    const countries = facetValues(facets, "locationCountry")
    if (realTotal >= CXS_RESULT_CAP) {
      await read({}, first, realTotal, [])
      // Postings without a country in the facet: the unfiltered pages, as far as the cap allows.
      await sweep({}, first, CXS_RESULT_CAP)
    } else {
      await sweep({}, first, total)
      // A posting listed with more places than its text names ("2 Locations") gets them from its
      // own page, or, when that would cost more, from the country slices (a page per 20 postings).
      const needing = [...collected.values()].filter((entry) =>
        hasMorePlaces(entry.posting.locationsText)
      )
      const sliceCost = countries.reduce(
        (sum, value) => sum + Math.ceil((value.count ?? 0) / CXS_PAGE_SIZE),
        0
      )
      if (needing.length && (needing.length <= sliceCost || !countries.length)) {
        for (const entry of needing) {
          const info = (await detail(entry.posting.externalPath!))?.jobPostingInfo
          if (!info) {
            complete = false
            continue
          }
          entry.places = [info.location, ...(info.additionalLocations ?? [])].filter(
            (place): place is string => Boolean(place)
          )
          for (const country of [
            info.jobRequisitionLocation?.country?.alpha2Code,
            info.country?.alpha2Code,
            info.country?.descriptor,
          ]) {
            if (country) entry.countries.add(country)
          }
        }
      } else if (needing.length) {
        for (const value of countries) {
          if (!value.id || !value.count) continue
          const applied = { locationCountry: [value.id] }
          const page = await search(applied, 0)
          if (!page) {
            complete = false
            continue
          }
          await sweep(applied, page, value.count, value.descriptor)
        }
      }
    }
  } catch (error) {
    if (!(error instanceof RequestCapReached) && !(error instanceof UnsafeUrlError)) throw error
    complete = false
  }

  const companyName = target.companyName
  const firstPath = [...collected.keys()][0]
  const publishedName = firstPath
    ? cleanOrganisation((await detail(firstPath).catch(() => null))?.hiringOrganization?.name)
    : undefined
  const jobs: ListedJob[] = []
  for (const { posting, countries, places } of collected.values()) {
    const listed = buildListedJob({
      externalId: externalIdFromPath(posting.externalPath!),
      title: posting.title!,
      companyName,
      locationText: places?.length ? places.join(" | ") : posting.locationsText,
      countryCodes: [...countries],
      publishedAt: postedFromText(posting.postedOn, now),
      originalUrl: `https://${target.host}/${target.site}${posting.externalPath}`,
      sourceType: "WORKDAY",
      sourceBoardId: target.boardId,
      needsHydration: true,
    })
    if (listed) jobs.push(listed)
  }
  const seen = collected.size
  // A capped tenant counts as read in full only when the slices reached nearly every posting the
  // facets report; a read that is not complete closes nothing.
  const reached = realTotal >= CXS_RESULT_CAP ? seen >= realTotal * 0.97 : seen >= total
  return {
    jobs,
    proven: true,
    companyName,
    publishedName,
    listedCount: Math.max(realTotal, seen),
    complete: complete && reached,
    note: `Workday search: ${seen} of ${realTotal} postings in ${slices} slices, ${requests} requests.${
      complete ? "" : " Not the whole inventory this read."
    }`.slice(0, 500),
  }
}
