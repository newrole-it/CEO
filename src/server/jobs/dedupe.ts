import {createHash} from "crypto"
import {normalizeCompanyName, normalizeWhitespace, titleTokens} from "./normalize"

const TRACKING = /^(utm_|gh_|lever-|source|ref|trk|mc_|fbclid|gclid|igshid)/i

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex")
}

export function canonicalUrl(raw: string): string {
  const url = new URL(raw)
  url.hash = ""
  url.hostname = url.hostname.toLowerCase()
  const kept = new URLSearchParams()
  const keys = Array.from(url.searchParams.keys()).sort()
  for (const key of keys) {
    if (TRACKING.test(key)) continue
    const values = url.searchParams.getAll(key)
    for (const value of values) kept.append(key, value)
  }
  url.search = kept.toString() ? `?${kept.toString()}` : ""
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "")
  }
  return url.toString()
}

export function contentHash(parts: {title: string; description: string; location: string}): string {
  return sha256(
    [normalizeWhitespace(parts.title).toLowerCase(), normalizeWhitespace(parts.location).toLowerCase(), parts.description.slice(0, 2000)].join(
      "\n",
    ),
  )
}

export function jobFingerprint(parts: {
  companyName: string
  title: string
  location: string
  description: string
}): string {
  const title = titleTokens(parts.title).join(" ")
  const company = normalizeCompanyName(parts.companyName)
  const location = normalizeWhitespace(parts.location).toLowerCase()
  const desc = normalizeWhitespace(parts.description).toLowerCase().slice(0, 240)
  return sha256([company, title, location, desc].join("|"))
}

export function sourceIdentity(parts: {
  sourceType: string
  sourceBoardId?: string
  externalId?: string
  canonical: string
}): string {
  if (parts.externalId && parts.sourceBoardId) {
    return `${parts.sourceType}:${parts.sourceBoardId}:${parts.externalId}`
  }
  if (parts.externalId) return `${parts.sourceType}:job:${parts.externalId}`
  return `url:${parts.canonical}`
}
