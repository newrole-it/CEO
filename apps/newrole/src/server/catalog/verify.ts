/**
 * One board from an outside list, checked on its own platform before it reaches the index, and
 * again on every later read: it exists, it is the company the list says, it has IT offers, and
 * those offers say where they are (outside the blocked countries).
 */
import { adapterFor, type LiveAts } from "src/server/adapters/registry"
import { compactName, namesAgree } from "src/server/adapters/blocked"
import { isSlugAlias } from "src/server/adapters/hosts"
import type { BoardList } from "src/server/adapters/types"
import { politeGet, type RobotsCache } from "@newrole/offers/polite"
import { boardCountry, withBoardCountry } from "src/server/geo/countries"
import { placeOf } from "src/server/index/store"
import { boardIsTech, gateJob, type GateCounts } from "src/server/jobs/gate"
import { decodeEntities } from "@newrole/offers/text"
import type { HttpClient } from "src/server/security/safe-fetch"
import { boardUrl } from "src/server/watchlist/resolve"
import type { SourceType } from "src/shared/schemas"

export type CatalogReason =
  | "not_found"
  | "no_jobs"
  | "identity"
  | "junk_name"
  | "no_it_jobs"
  | "no_country"
  | "blocked_country"
  | "unsupported"
  | "error"

export type BoardVerdict = {
  status: "verified" | "rejected"
  reason?: CatalogReason
  note?: string
  companyName?: string
  listed: BoardList | null
  listedJobs: number
  itJobs: number
  countries: string[]
  rejected: GateCounts
}

/** Platforms whose list API carries no company name. Their public board page does, or nothing does. */
const PAGE_NAMED = new Set<SourceType>(["ASHBY", "LEVER"])
const API_NAMED = new Set<SourceType>([
  "GREENHOUSE",
  "WORKABLE",
  "RECRUITEE",
  "TEAMTAILOR",
  "BREEZY",
  "PINPOINT",
])

/**
 * A name nobody would give a company: digits only, or one run of letters and digits that is
 * also the board id ("12jlkfsk"). Such a row is the outside list echoing a slug.
 */
export function looksLikeJunkName(name: string, boardId: string): boolean {
  const text = name.trim()
  if (!/\p{L}/u.test(text)) return true
  const compact = compactName(text)
  if (!compact) return true
  const echo = compact === compactName(boardId.replace(/^eu:/, "").split(".")[0] ?? "")
  return echo && /\d/.test(compact) && !/\s/.test(text)
}

/** "Mistral Jobs" → "Mistral", "Jobs at Acme" → "Acme". Null for an empty or generic title. */
export function nameFromTitle(title: string | undefined): string | null {
  const text = decodeEntities(title || "")
    .replace(/\s+/g, " ")
    .replace(/^(jobs|careers|open positions) at\s+/i, "")
    .replace(/\s*[-|·–]\s*(jobs|careers).*$/i, "")
    .replace(/\s+(jobs|careers)$/i, "")
    .trim()
  if (!text || /^(jobs|careers|lever|ashby)$/i.test(text)) return null
  return text.slice(0, 200)
}

/**
 * Department words a platform can publish in place of the company: Pinpoint returned "HR" for
 * Spiralyze (2026-11-03). Such a name says nothing about who is hiring.
 */
const GENERIC_NAME =
  /^(hr|human resources|people|talent|talent acquisition|recruiting|recruitment|hiring|careers?|jobs?|team|join us|work with us)$/i

export function isGenericName(name: string): boolean {
  return GENERIC_NAME.test(name.trim())
}

/** The platform's name, unless the list spells the same name properly: "Fortil" over "fortil". */
export function preferredName(published: string, listedName: string): string {
  const sameName = compactName(published) === compactName(listedName)
  const plainLower = published === published.toLowerCase()
  return sameName && plainLower && listedName !== listedName.toLowerCase()
    ? listedName.trim()
    : published
}

/**
 * The board page's name, or gone when the page answers 404 or 410. Lever keeps listing postings
 * in its API after a company turns its hosted job site off, and then every offer link is a 404
 * (jobs.lever.co/wyetechllc and /latitudeinc, board and offer pages, 2026-11-03).
 */
/**
 * The board page on the host its offers link to. The Lever API answers an EU board under the global
 * slug, but its pages live on jobs.eu.lever.co: jobs.lever.co/xtb is a 404 while
 * jobs.eu.lever.co/xtb/... opens (2026-11-03).
 */
export function boardPageUrl(provider: SourceType, boardId: string, listed: BoardList): string {
  const first = listed.jobs[0]?.originalUrl
  try {
    const url = new URL(first ?? "")
    const slug = url.pathname.split("/").filter(Boolean)[0]
    // Only the platform's own pages: a link to the company's site has no board page to read.
    const platformHost = /(^|\.)(lever\.co|ashbyhq\.com)$/.test(url.hostname)
    if (slug && platformHost) return `${url.origin}/${slug}`
  } catch {
    // No usable offer link: fall back to the platform's usual board address.
  }
  return boardUrl(provider, boardId)
}

async function readBoardPage(
  pageUrl: string,
  http: HttpClient,
  robots: RobotsCache
): Promise<{ name: string | null; gone: boolean }> {
  const page = await politeGet(pageUrl, http, robots, {
    accept: "text/html",
    // Lever's board page for a large employer runs past a megabyte; the title is in its head.
    maxBytes: 6_000_000,
  })
  if (!page.ok) return { name: null, gone: /answered (404|410)$/.test(page.reason) }
  if (page.response.status >= 400) return { name: null, gone: false }
  return {
    name: nameFromTitle(page.response.body.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]),
    gone: false,
  }
}

function reasonFromNote(note: string | undefined): CatalogReason {
  const text = note || ""
  if (/identity check/i.test(text)) return "identity"
  if (/not found|404/i.test(text)) return "not_found"
  if (/no open jobs|has no open|empty jobs array|no jobs/i.test(text)) return "no_jobs"
  if (/identity|does not match|, not |wrong-company|blocked|is .+, not /i.test(text))
    return "identity"
  return "not_found"
}

/**
 * A Workday tenant is the employer's own host, and Workday publishes no company name except the
 * hiring organisation on a posting ("Motorola Solutions Norway AS"). The list's name stands when
 * the tenant or that organisation agrees with it; otherwise the organisation does.
 */
export function workdayName(
  boardId: string,
  listedName: string,
  published: string | undefined
): { name: string } | { reason: CatalogReason; note: string } {
  const tenant = boardId.split("/")[0] ?? boardId
  const listedFits = Boolean(listedName) && !looksLikeJunkName(listedName, tenant)
  if (listedFits && (namesAgree(listedName, tenant) || namesAgree(listedName, published))) {
    return { name: listedName }
  }
  if (published && !isGenericName(published)) return { name: published }
  if (listedFits) return { name: listedName }
  return { reason: "junk_name", note: `No company name for Workday tenant ${tenant}` }
}

/** The name the board is stored under, or the reason it cannot be trusted. */
async function confirmedName(args: {
  provider: SourceType
  boardId: string
  listedName: string
  listed: BoardList
  http: HttpClient
  robots: RobotsCache
}): Promise<{ name: string } | { reason: CatalogReason; note: string }> {
  const { provider, boardId, listedName, listed } = args
  if (provider === "WORKDAY") return workdayName(boardId, listedName, listed.publishedName)
  const listedIsSlug = isSlugAlias(listedName, boardId) || looksLikeJunkName(listedName, boardId)
  let published: string | null = null
  if (API_NAMED.has(provider)) published = listed.companyName ?? null
  else if (provider === "PERSONIO") published = listed.publishedName ?? null
  else if (PAGE_NAMED.has(provider)) {
    const pageUrl = boardPageUrl(provider, boardId, listed)
    const page = await readBoardPage(pageUrl, args.http, args.robots)
    if (page.gone) {
      return {
        reason: "not_found",
        note: `${pageUrl} answers 404, so its offer links would not open`,
      }
    }
    published = page.name
  }
  if (published && isGenericName(published)) published = null
  // The platform's own name wins when it fits the slug: the list may misspell it ("Pixle Pool").
  const publishedFitsSlug = Boolean(
    published && (isSlugAlias(published, boardId) || namesAgree(published, boardId))
  )
  if (published && !listedIsSlug && !namesAgree(listedName, published) && !publishedFitsSlug) {
    return { reason: "identity", note: `The platform names ${published}, the list ${listedName}` }
  }
  if (published) {
    if (!/\p{L}/u.test(published)) {
      return { reason: "junk_name", note: `“${published}” is not a company name` }
    }
    return { name: preferredName(published, listedName) }
  }
  if (!isSlugAlias(listedName, boardId) && !namesAgree(listedName, boardId)) {
    // Nothing on the platform names the company and the slug does not either.
    return {
      reason: "identity",
      note: `No published name, and ${boardId} does not read as ${listedName}`,
    }
  }
  if (looksLikeJunkName(listedName, boardId)) {
    return { reason: "junk_name", note: `“${listedName}” is not a company name` }
  }
  return { name: listedName }
}

export async function verifyBoard(
  candidate: { provider: SourceType; providerBoardId: string; listedName: string },
  http: HttpClient,
  robots: RobotsCache
): Promise<BoardVerdict> {
  const empty = { listed: null, listedJobs: 0, itJobs: 0, countries: [], rejected: {} }
  let adapter
  try {
    adapter = adapterFor(candidate.provider as LiveAts)
  } catch {
    return { ...empty, status: "rejected", reason: "unsupported", note: candidate.provider }
  }
  // Platforms that publish a name are read without one, so their own name comes back and the
  // identity rules below judge it. The others get the list's name as the display name only.
  // Pinpoint's adapter runs its own identity check against the list's name, so it gets one.
  const expected =
    API_NAMED.has(candidate.provider) && candidate.provider !== "PINPOINT"
      ? undefined
      : candidate.listedName
  let listed: BoardList
  try {
    listed = await adapter.list(candidate.providerBoardId, http, expected)
  } catch (error) {
    const note = error instanceof Error ? error.message : "Board read failed"
    return { ...empty, status: "rejected", reason: "error", note: note.slice(0, 300) }
  }
  if (!listed.proven) {
    return {
      ...empty,
      status: "rejected",
      reason: reasonFromNote(listed.note),
      note: listed.note?.slice(0, 300),
    }
  }

  const named = await confirmedName({
    provider: candidate.provider,
    boardId: candidate.providerBoardId,
    listedName: candidate.listedName,
    listed,
    http,
    robots,
  })
  if ("reason" in named) {
    return { ...empty, status: "rejected", reason: named.reason, note: named.note, listed }
  }

  const techBoard = boardIsTech(listed.jobs.map((job) => job.title))
  const places = listed.jobs.map(placeOf)
  const lent = boardCountry(places)
  const rejected: GateCounts = {}
  const countries = new Set<string>()
  let itJobs = 0
  for (const [index, job] of listed.jobs.entries()) {
    const place = withBoardCountry(places[index], lent)
    const reason = gateJob(job, place, { boardIsTech: techBoard })
    if (reason) {
      rejected[reason] = (rejected[reason] ?? 0) + 1
      continue
    }
    itJobs += 1
    for (const code of place.countries) countries.add(code)
    for (const region of place.remoteRegions) countries.add(`remote:${region}`)
  }
  const base = {
    listed,
    companyName: named.name,
    listedJobs: listed.jobs.length,
    itJobs,
    countries: [...countries].sort(),
    rejected,
  }
  if (itJobs > 0) return { ...base, status: "verified" }
  const reason: CatalogReason = rejected.blocked_country
    ? "blocked_country"
    : rejected.no_country
    ? "no_country"
    : "no_it_jobs"
  return { ...base, status: "rejected", reason }
}
