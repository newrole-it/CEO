import { createHash } from "crypto"

// gh_src is Greenhouse's referral tag. gh_jid is the job id on employer-hosted Greenhouse
// boards (stripe.com/jobs/search?gh_jid=...), so it must stay or every job shares one URL.
const TRACKING = /^(utm_|gh_src$|lever-|source|ref|trk|mc_|fbclid|gclid|igshid)/i

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

/** canonicalUrl for input that may not parse: an unparseable value is its own key. */
export function safeCanonicalUrl(raw: string): string {
  try {
    return canonicalUrl(raw)
  } catch {
    return raw
  }
}
