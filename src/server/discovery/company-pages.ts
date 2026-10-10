import { decideFetch } from "config/source-policies"

function hostOf(raw: string): string {
  return new URL(raw).hostname.toLowerCase().replace(/^www\./, "")
}

/** Company pages worth a JSON-LD read. Link-only hosts and disallowed APIs are dropped. */
export function rememberCompanyPage(pages: string[], raw: string): void {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return
  }
  if (!decideFetch(url).allow) return
  if (url.pathname.toLowerCase().includes("/api/")) return
  const host = hostOf(url.toString())
  if (host === "synerise.com") {
    if (!/\/careers\/[^/]+/i.test(url.pathname)) return
    const count = pages.filter((item) => {
      try {
        return hostOf(item) === "synerise.com"
      } catch {
        return false
      }
    }).length
    if (count >= 12) return
    pages.push(url.toString())
    return
  }
  const others = pages.filter((item) => {
    try {
      return hostOf(item) !== "synerise.com"
    } catch {
      return true
    }
  }).length
  if (others < 2) pages.push(url.toString())
}
