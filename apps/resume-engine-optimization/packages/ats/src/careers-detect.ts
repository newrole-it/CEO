/**
 * Read a company page for a way to its job offers. Pure: no network, no database.
 * The HTML is only scanned here and never stored.
 */
import { isAggregatorHost } from "@newrole/offers/hosts"
import { decodeEntities } from "@newrole/offers/text"
import { detectBoard, type DetectedBoard } from "./boards"

export { isAggregatorHost }

export type CareersLink = { url: string; text: string; score: number }

export type AtsMarker =
  | { kind: "board"; provider: DetectedBoard["provider"]; boardId: string; evidence: string }
  | { kind: "link-only"; vendor: string; url: string }

const CAREER_WORDS =
  /\b(kariera|karier[aey]|careers?|jobs?|praca|pracuj z nami|join[- ]us|join our team|dołącz|dolacz|oferty pracy|open positions|work with us|we'?re hiring|rekrutacja|vacancies)\b/i

const CAREER_PATH =
  /\/(kariera|careers?|jobs?|praca|join-?us|dolacz|dolacz-do-nas|oferty-pracy|work-with-us|open-positions|vacancies|rekrutacja)(\/|$|\?|#|\.html?)/i

const LINK_ONLY_VENDORS: Array<{ vendor: string; host: RegExp }> = [
  // skk.erecruiter.pl is the readable widget (adapters/erecruiter.ts); the other hosts stay links.
  { vendor: "eRecruiter", host: /^(?!skk\.)([a-z0-9-]+\.)*erecruiter\.pl$/i },
  { vendor: "Workday", host: /(^|\.)myworkdayjobs\.com$/i },
  { vendor: "SuccessFactors", host: /(^|\.)(successfactors\.(com|eu)|sapsf\.(com|eu))$/i },
  { vendor: "iCIMS", host: /(^|\.)icims\.com$/i },
  { vendor: "Taleo", host: /(^|\.)taleo\.net$/i },
  { vendor: "JOIN", host: /(^|\.)join\.com$/i },
  { vendor: "HiBob", host: /(^|\.)hibob\.com$/i },
]

export function hostOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/\.$/, "")
  } catch {
    return null
  }
}

/** The company's own domain: no www, careers., kariera. or jobs. prefix. */
export function companyDomain(raw: string): string | null {
  const host = hostOf(raw)
  if (!host) return null
  return host.replace(/^(www|careers|career|kariera|jobs|praca|join)\./, "")
}

function sameSite(left: string, right: string): boolean {
  const a = left.replace(/^www\./, "")
  const b = right.replace(/^www\./, "")
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)
}

function anchors(html: string): Array<{ href: string; text: string }> {
  const out: Array<{ href: string; text: string }> = []
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/href\s*=\s*["']([^"']+)["']/i)?.[1]?.trim()
    if (!href) continue
    const label = match[1].match(/(?:aria-label|title)\s*=\s*["']([^"']+)["']/i)?.[1] ?? ""
    const text = decodeEntities(
      `${match[2].replace(/<[^>]+>/g, " ")} ${label}`.replace(/\s+/g, " ").trim()
    )
    out.push({ href, text })
  }
  return out
}

/**
 * Links that look like the careers page. Same-site links and known ATS hosts only,
 * best first. Polish boards and LinkedIn are dropped.
 */
export function findCareersLinks(html: string, pageUrl: string): CareersLink[] {
  const pageHost = hostOf(pageUrl)
  if (!pageHost) return []
  const byUrl = new Map<string, CareersLink>()
  for (const anchor of anchors(html)) {
    if (/^(mailto:|tel:|javascript:|#)/i.test(anchor.href)) continue
    let url: URL
    try {
      url = new URL(decodeEntities(anchor.href), pageUrl)
    } catch {
      continue
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue
    const host = url.hostname.toLowerCase()
    if (isAggregatorHost(host)) continue
    const ats = Boolean(detectBoard(url.toString()))
    if (!ats && !sameSite(host, pageHost)) continue
    let score = 0
    if (CAREER_PATH.test(url.pathname)) score += 3
    if (/^(careers?|kariera|jobs|praca)\./.test(host)) score += 3
    if (CAREER_WORDS.test(anchor.text)) score += 2
    if (ats) score += 4
    if (score === 0) continue
    if (/\/(blog|news|aktualnosci|press)\//i.test(url.pathname)) score -= 2
    url.hash = ""
    const key = url.toString()
    const current = byUrl.get(key)
    if (!current || current.score < score) {
      byUrl.set(key, { url: key, text: anchor.text.slice(0, 80), score })
    }
  }
  return [...byUrl.values()].filter((link) => link.score > 0).sort((a, b) => b.score - a.score)
}

const EMBED_PATTERNS: Array<{ provider: DetectedBoard["provider"]; pattern: RegExp }> = [
  {
    provider: "GREENHOUSE",
    pattern:
      /(?:boards|job-boards)\.greenhouse\.io\/embed\/job_board(?:\/js)?\?for=([a-z0-9_-]+)/gi,
  },
  { provider: "GREENHOUSE", pattern: /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/gi },
  { provider: "GREENHOUSE", pattern: /grnhse_board[^"']*["'][^"']*for=([a-z0-9_-]+)/gi },
  { provider: "LEVER", pattern: /api\.lever\.co\/v0\/postings\/([a-z0-9_-]+)/gi },
  { provider: "ASHBY", pattern: /jobs\.ashbyhq\.com\/([a-z0-9_.-]+)\/embed/gi },
  { provider: "ASHBY", pattern: /api\.ashbyhq\.com\/posting-api\/job-board\/([a-z0-9_.-]+)/gi },
  { provider: "WORKABLE", pattern: /workable\.com\/widget\/accounts\/([a-z0-9_-]+)/gi },
  {
    provider: "WORKABLE",
    pattern: /apply\.workable\.com\/api\/v\d\/(?:widget\/)?accounts\/([a-z0-9_-]+)/gi,
  },
  {
    provider: "SMARTRECRUITERS",
    pattern: /api\.smartrecruiters\.com\/v1\/companies\/([a-z0-9_-]+)\/postings/gi,
  },
  { provider: "ERECRUITER", pattern: /skk\.erecruiter\.pl\/Code\.ashx\?cfg=([0-9a-f]{32})/gi },
  { provider: "ERECRUITER", pattern: /[?&]skkcfg=([0-9a-f]{32})/gi },
  { provider: "ERECRUITER", pattern: /https?:\/\/([a-z0-9-]+)\.pracujunas\.pl/gi },
]

const ATS_URL =
  /https?:\/\/[a-z0-9.-]*(?:greenhouse\.io|lever\.co|ashbyhq\.com|workable\.com|smartrecruiters\.com|teamtailor\.com|recruitee\.com|personio\.(?:de|com)|traffit\.com|pinpointhq\.com|breezy\.hr|bamboohr\.com|erecruiter\.pl|pracujunas\.pl|myworkdayjobs\.com|successfactors\.(?:com|eu)|sapsf\.(?:com|eu)|icims\.com|taleo\.net|hibob\.com|jobvite\.com|avature\.net|rippling\.com|gem\.com|polymer\.co|dover\.com|homerun\.co|loxo\.co|careers-page\.com|rexx-systems\.com|rexx-recruitment\.com|zohorecruit\.(?:com|eu)|softgarden\.de|dvinci-hr\.com|onlyfy\.jobs|applytojob\.com|catsone\.com|talentlyft\.com|factorialhr\.com)[^\s"'<>)\\]*/gi

/**
 * ATS boards named anywhere in the page: links, iframes, scripts, and embed snippets.
 * Teamtailor and Recruitee pages on a custom domain are detected from their assets.
 */
export function findAtsMarkers(html: string, pageUrl: string): AtsMarker[] {
  const markers: AtsMarker[] = []
  const seen = new Set<string>()
  const push = (marker: AtsMarker) => {
    const key =
      marker.kind === "board"
        ? `${marker.provider}:${marker.boardId.toLowerCase()}`
        : `link:${marker.vendor}`
    if (seen.has(key)) return
    seen.add(key)
    markers.push(marker)
  }
  const text = decodeEntities(html).replace(/\\\//g, "/")
  for (const { provider, pattern } of EMBED_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const slug = match[1]
      if (!slug || /^(jobs?|embed|api|v\d)$/i.test(slug)) continue
      push({ kind: "board", provider, boardId: slug, evidence: match[0].slice(0, 120) })
    }
  }
  for (const match of text.matchAll(ATS_URL)) {
    const raw = match[0].replace(/[.,;]+$/, "")
    const host = hostOf(raw)
    if (!host) continue
    const vendor = LINK_ONLY_VENDORS.find((item) => item.host.test(host))
    if (vendor) {
      push({ kind: "link-only", vendor: vendor.vendor, url: raw })
      continue
    }
    if (/(^|\.)(app|api|www|cdn|assets|scripts|static)\.(teamtailor|recruitee)\.com$/.test(host))
      continue
    if (/teamtailor-cdn|recruitee-cdn/.test(host)) continue
    const board = detectBoard(raw)
    if (board) push({ kind: "board", ...board, evidence: raw.slice(0, 120) })
  }
  const pageHost = hostOf(pageUrl)
  if (pageHost && !markers.some((marker) => marker.kind === "board")) {
    if (/teamtailor-cdn\.com|content=["']Teamtailor["']|teamtailor\.com\/assets/i.test(html)) {
      push({
        kind: "board",
        provider: "TEAMTAILOR",
        boardId: pageHost,
        evidence: "Teamtailor assets",
      })
    } else if (/phenompeople\.com|window\.phApp\b|["']ddoKey["']/i.test(html)) {
      push({ kind: "board", provider: "PHENOM", boardId: pageHost, evidence: "Phenom assets" })
    } else if (/\/JobDetail\/[^"'\s]+\/\d+|jobRecordsPerPage=/i.test(html)) {
      push({
        kind: "board",
        provider: "AVATURE",
        boardId: pageHost,
        evidence: "Avature portal paths",
      })
    }
  }
  return markers
}

/** Board ids that are not a tenant at all (vendor marketing hosts). */
export function plausibleBoard(marker: { provider: string; boardId: string }): boolean {
  const id = marker.boardId.toLowerCase()
  if (!id || id.length > 120) return false
  return !["www", "app", "api", "careers", "jobs", "help", "support", "blog"].includes(id)
}

/** The site name from og:site_name, then the <title> head. */
export function siteName(html: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i)?.[1]
  const raw = og || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
  if (!raw) return null
  const text = decodeEntities(raw).replace(/\s+/g, " ").trim()
  const parts = text
    .split(/\s+[|–—-]\s+|\s*[|·•]\s*/)
    .map((part) => part.trim())
    .filter(Boolean)
  const generic = /^(home|strona główna|kariera|careers?|jobs?|praca|welcome)$/i
  const name = parts.find((part) => !generic.test(part) && part.length <= 60) ?? parts[0]
  return name && name.length <= 80 ? name : null
}

/** Same-site links whose path looks like one job offer. */
export function jobLinks(html: string, pageUrl: string, limit = 40): string[] {
  const pageHost = hostOf(pageUrl)
  if (!pageHost) return []
  const out: string[] = []
  for (const anchor of anchors(html)) {
    let url: URL
    try {
      url = new URL(decodeEntities(anchor.href), pageUrl)
    } catch {
      continue
    }
    if (!sameSite(url.hostname.toLowerCase(), pageHost)) continue
    if (!looksLikeJobPath(url.pathname)) continue
    url.hash = ""
    const key = url.toString()
    if (key === pageUrl || out.includes(key)) continue
    out.push(key)
    if (out.length >= limit) break
  }
  return out
}

/** A path with a careers segment followed by a slug, e.g. /kariera/senior-java-developer. */
export function looksLikeJobPath(pathname: string): boolean {
  return /\/(kariera|careers?|jobs?|oferty?(-pracy)?|praca|positions?|vacanc(y|ies)|job-offers?|open-positions)\/[^/?#]{4,}/i.test(
    pathname
  )
}
