import { publicAppUrl } from "src/server/site-url"

/** CRAWLER_NOTE says who runs this app and why, when that is not one person's own job search. */
export function fetchUserAgent(): string {
  const note = process.env.CRAWLER_NOTE?.trim() || "personal non-commercial job search"
  return `NewRoleBot/0.1 (+${publicAppUrl()}/bot; ${note})`
}
