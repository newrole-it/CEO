import {
  LIMIT,
  settleWebClaim,
  type BriefPoint,
  type UnreadReason,
  type WebClaim,
} from "@newrole/cv-core/research"
import { aiOptOut } from "@newrole/offers/hygiene"
import { createRobotsCache, politeGet, type RobotsCache } from "@newrole/offers/polite"
import { htmlToText } from "@newrole/offers/text"
import type { HttpClient } from "src/server/security/safe-fetch"

/**
 * The check behind every web point of a company brief (src/server/research/service.ts): the model
 * says a page states something and quotes it; here newrole.it reads that page itself and keeps
 * the point only when the quote is on it (@newrole/cv-core/research settleWebClaim).
 *
 * The read is the polite one of @newrole/offers (polite.ts): the source policies as for the
 * crawler, so job boards, LinkedIn, social sites and the other hosts of hosts.ts are never read,
 * then robots.txt, no way around a login or bot wall, one request a second per host. A page that
 * opts out of AI use (hygiene.ts) counts as unread too: the point was a model's reading of it.
 * Nothing of a page is stored but the quote the model gave.
 *
 * A page newrole.it could not read confirms nothing, so its points are not shown; the page is
 * listed for the person to open themselves.
 */

export type PageRead = { ok: true; text: string } | { ok: false; reason: UnreadReason }

export async function readSourcePage(
  url: string,
  http: HttpClient,
  robots: RobotsCache
): Promise<PageRead> {
  const result = await politeGet(url, http, robots)
  if (!result.ok) return { ok: false, reason: result.linkOnly ? "blocked" : "failed" }
  const { body, contentType } = result.response
  if (!/html|text\/plain|xml/i.test(contentType)) return { ok: false, reason: "not-text" }
  if (aiOptOut(body, new URL(url).hostname)) return { ok: false, reason: "opt-out" }
  return { ok: true, text: /html|xml/i.test(contentType) ? htmlToText(body) : body }
}

export type WebCheck = {
  /** Claims whose quote is on the page newrole.it read */
  points: BriefPoint[]
  /** Pages that could not be read, each once */
  unread: { url: string; reason: UnreadReason }[]
  /** Claims whose page was read and does not hold the quote, or is not about the company */
  notConfirmed: number
}

/**
 * Reads the page of every claim, each address once and at most LIMIT.webPages of them, and settles
 * the claims against what was read.
 */
export async function checkWebClaims(
  claims: WebClaim[],
  company: { names: string[]; domain: string | null },
  deps: { http: HttpClient; now: Date }
): Promise<WebCheck> {
  const robots = createRobotsCache()
  const pages = new Map<string, PageRead>()
  const check: WebCheck = { points: [], unread: [], notConfirmed: 0 }
  for (const claim of claims) {
    let page = pages.get(claim.url)
    if (!page) {
      page =
        pages.size >= LIMIT.webPages
          ? { ok: false, reason: "limit" }
          : await readSourcePage(claim.url, deps.http, robots)
      pages.set(claim.url, page)
      if (!page.ok) check.unread.push({ url: claim.url, reason: page.reason })
    }
    if (!page.ok) continue
    const point = settleWebClaim(claim, page, company, deps.now)
    if (point) check.points.push(point)
    else check.notConfirmed += 1
  }
  return check
}
