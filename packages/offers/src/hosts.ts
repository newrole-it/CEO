import { isPolishBoardHost } from "./polish-boards"

/** Hosts that are never a company's own careers page. */
const NOT_COMPANY_HOSTS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "twitter.com",
  "x.com",
  "youtube.com",
  "glassdoor.com",
  "glassdoor.pl",
  "indeed.com",
  "wikipedia.org",
  "github.com",
  "crunchbase.com",
  "goldenline.pl",
  "rocketjobs.pl",
]

function hostMatches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

/** LinkedIn, Polish job boards, and social sites. They are never fetched as a company page. */
export function isAggregatorHost(host: string): boolean {
  const clean = host.toLowerCase().replace(/^www\./, "")
  if (isPolishBoardHost(clean)) return true
  return NOT_COMPANY_HOSTS.some((suffix) => hostMatches(clean, suffix))
}
