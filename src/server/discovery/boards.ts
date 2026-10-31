import type { SourceType } from "src/shared/schemas"
import { isPolishBoardHost } from "src/shared/polish-boards"
import { isWorkdayHost } from "src/shared/workday-boards"

export type DetectedBoard = {
  provider: Exclude<SourceType, "GENERIC_HTML" | "WEB_SEARCH">
  boardId: string
}

const RESERVED = new Set(["jobs", "job", "embed", "api", "v1", "j", "companies", "postings"])

function firstSegment(pathname: string): string | null {
  const segment = pathname.split("/").filter(Boolean)[0]
  if (!segment || RESERVED.has(segment.toLowerCase())) return null
  return decodeURIComponent(segment)
}

export function detectBoard(raw: string): DetectedBoard | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const parts = url.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part))

  if (host === "boards.greenhouse.io" || host === "job-boards.greenhouse.io") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "GREENHOUSE", boardId } : null
  }
  if (host === "boards-api.greenhouse.io") {
    const index = parts.findIndex((part) => part === "boards")
    const boardId = index >= 0 ? parts[index + 1] : undefined
    return boardId ? { provider: "GREENHOUSE", boardId } : null
  }
  if (host === "jobs.eu.lever.co" || host === "api.eu.lever.co") {
    const boardId = leverSlugFrom(host, parts, url.pathname)
    return boardId ? { provider: "LEVER", boardId: `eu:${boardId}` } : null
  }
  if (host === "jobs.lever.co" || host === "api.lever.co") {
    const boardId = leverSlugFrom(host, parts, url.pathname)
    return boardId ? { provider: "LEVER", boardId } : null
  }
  if (host === "jobs.ashbyhq.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "ASHBY", boardId } : null
  }
  if (host === "apply.workable.com") {
    const boardId = firstSegment(url.pathname)
    if (!boardId || boardId.toLowerCase() === "j") return null
    return { provider: "WORKABLE", boardId }
  }
  if (host === "jobs.smartrecruiters.com" || host === "careers.smartrecruiters.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "SMARTRECRUITERS", boardId } : null
  }
  if (host === "jobs.jobvite.com") {
    const slug = parts[0]?.toLowerCase() === "careers" ? parts[1] : parts[0]
    if (!slug || RESERVED.has(slug.toLowerCase()) || slug.toLowerCase() === "careers") return null
    return { provider: "JOBVITE", boardId: slug }
  }
  if (host === "skk.erecruiter.pl" || host === "system.erecruiter.pl") {
    const cfg = url.searchParams.get("skkcfg") ?? (host === "skk.erecruiter.pl" ? url.searchParams.get("cfg") : null)
    return cfg && /^[0-9a-f]{32}$/i.test(cfg) ? { provider: "ERECRUITER", boardId: cfg.toLowerCase() } : null
  }
  const pracujunas = host.match(/^([a-z0-9-]+)\.pracujunas\.pl$/)
  if (pracujunas && pracujunas[1] !== "www") return { provider: "ERECRUITER", boardId: pracujunas[1] }
  if (host.endsWith(".avature.net") && host !== "www.avature.net") {
    return { provider: "AVATURE", boardId: host }
  }
  // Bullhorn and Comeet boards need a token from the page, so they are added by hand.
  if (host === "ats.rippling.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "RIPPLING", boardId } : null
  }
  if (host === "jobs.gem.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "GEM", boardId } : null
  }
  if (host === "jobs.polymer.co") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "POLYMER", boardId } : null
  }
  if (host === "app.dover.com") {
    const boardId = parts[0] === "jobs" || parts[0] === "apply" ? parts[1] : undefined
    return boardId ? { provider: "DOVER", boardId } : null
  }
  if (host === "feed.homerun.co") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "HOMERUN", boardId } : null
  }
  if (host === "app.loxo.co") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "LOXO", boardId } : null
  }
  if (host === "www.careers-page.com") {
    const boardId = firstSegment(url.pathname)
    return boardId ? { provider: "MANATAL", boardId } : null
  }
  if (host.endsWith(".rexx-systems.com") || host.endsWith(".rexx-recruitment.com")) {
    return { provider: "REXX", boardId: host }
  }
  if (host.endsWith(".zohorecruit.eu")) return { provider: "ZOHO_RECRUIT", boardId: host }
  const tenant = tenantBoard(host)
  if (tenant) return tenant
  return null
}

function leverSlugFrom(host: string, parts: string[], pathname: string): string | null {
  if (host.startsWith("api.")) {
    const index = parts.findIndex((part) => part === "postings")
    const slug = index >= 0 ? parts[index + 1] : undefined
    return slug || null
  }
  return firstSegment(pathname)
}

function tenantBoard(host: string): DetectedBoard | null {
  const rules: Array<{ root: string; provider: DetectedBoard["provider"] }> = [
    { root: "teamtailor.com", provider: "TEAMTAILOR" },
    { root: "recruitee.com", provider: "RECRUITEE" },
    { root: "jobs.personio.de", provider: "PERSONIO" },
    { root: "jobs.personio.com", provider: "PERSONIO" },
    { root: "traffit.com", provider: "TRAFFIT" },
    { root: "pinpointhq.com", provider: "PINPOINT" },
    { root: "breezy.hr", provider: "BREEZY" },
    { root: "bamboohr.com", provider: "BAMBOOHR" },
    { root: "career.softgarden.de", provider: "SOFTGARDEN" },
    { root: "zohorecruit.com", provider: "ZOHO_RECRUIT" },
    { root: "dvinci-hr.com", provider: "DVINCI" },
    { root: "homerun.co", provider: "HOMERUN" },
    { root: "onlyfy.jobs", provider: "ONLYFY" },
    { root: "applytojob.com", provider: "JAZZHR" },
    { root: "catsone.com", provider: "CATSONE" },
    { root: "talentlyft.com", provider: "TALENTLYFT" },
    { root: "factorialhr.com", provider: "FACTORIAL" },
  ]
  for (const rule of rules) {
    const slug = tenantSlug(host, rule.root)
    if (slug) return { provider: rule.provider, boardId: slug }
  }
  return null
}

function tenantSlug(host: string, root: string): string | null {
  if (host === root || !host.endsWith(`.${root}`)) return null
  const slug = host.slice(0, -(root.length + 1))
  if (!slug || slug.includes(".") || RESERVED.has(slug) || slug === "www") return null
  return slug
}

export function boardKey(provider: string, boardId: string): string {
  return `${provider}:${boardId.toLowerCase()}`
}

export type HitClass =
  | { kind: "ats"; provider: DetectedBoard["provider"]; boardId: string }
  | { kind: "workable-shortcode" }
  | { kind: "polish" }
  | { kind: "workday" }
  | { kind: "unverified-ats"; vendor: "greenhouse-eu" }
  | { kind: "other" }

export function classifyHit(raw: string): HitClass {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { kind: "other" }
  }
  const host = url.hostname.toLowerCase()
  if (isPolishBoardHost(host)) return { kind: "polish" }
  if (isWorkdayHost(host)) return { kind: "workday" }
  if (host.endsWith("eu.greenhouse.io")) return { kind: "unverified-ats", vendor: "greenhouse-eu" }
  if (
    host === "apply.workable.com" &&
    url.pathname.split("/").filter(Boolean)[0]?.toLowerCase() === "j"
  ) {
    return { kind: "workable-shortcode" }
  }
  const board = detectBoard(raw)
  if (board) return { kind: "ats", provider: board.provider, boardId: board.boardId }
  return { kind: "other" }
}

/** Pull a Workable account slug out of a shortcode page. The HTML is not stored. */
export function workableSlugFromHtml(html: string): string | null {
  const patterns = [
    /apply\.workable\.com\/([a-z0-9][a-z0-9-]{1,80})(?:\/|"|'|\?)/gi,
    /"subdomain"\s*:\s*"([a-z0-9][a-z0-9-]{1,80})"/i,
    /widget\/accounts\/([a-z0-9][a-z0-9-]{1,80})/i,
  ]
  for (const pattern of patterns) {
    const flags = pattern.flags.includes("g") ? pattern : new RegExp(pattern.source, pattern.flags)
    const match = flags.exec(html)
    const slug = match?.[1]?.toLowerCase()
    if (slug && slug !== "j" && slug !== "api" && slug !== "jobs") return slug
  }
  return null
}
