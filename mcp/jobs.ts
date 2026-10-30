import type { CandidateProfile } from "@prisma/client"
import { fold } from "matching/text"
import { listForYou, listOfferPage, type FeedOffer, type ForYouOffer } from "src/server/jobs/browse"
import { asStringList } from "src/server/profile/schema"

/**
 * Read side of the local index for MCP tools. Ranking is the web app's For-you score
 * (src/server/jobs/browse.ts), so Claude and the site always show the same number.
 */

export type OfferCard = {
  id: string
  title: string
  company: string
  url: string
  location: string | null
  workMode: string
  salary: string | null
  source?: string
  score?: number
  reasons?: string[]
  warnings?: string[]
  firstSeen?: string
}

export type Workplace = "remote" | "hybrid" | "onsite" | "any"

const MAX_FEED_PAGES = 6

const TITLE_NOISE = new Set(
  "senior junior mid regular lead staff principal head of and the i ii iii sr jr z w ds at for with".split(
    " "
  )
)

export function titleWords(text: string): string[] {
  return fold(text)
    .replace(/[^a-z0-9+#.]+/g, " ")
    .split(" ")
    .filter((word) => word.length > 1 && !TITLE_NOISE.has(word))
}

/** Words from the current and past titles: what "my kind of role" means for discovery. */
export function targetWords(
  profile: Pick<CandidateProfile, "currentTitle" | "headline" | "pastTitles">
): string[] {
  const titles = [
    profile.currentTitle || profile.headline,
    ...asStringList(profile.pastTitles),
  ].map((title) => (title ?? "").split(/\s+(?:at|@|w|in)\s+|[,|]/i)[0])
  const words = new Set<string>()
  for (const title of titles) for (const word of titleWords(title)) words.add(word)
  return [...words].slice(0, 16)
}

function sourceLabel(offer: FeedOffer): string {
  if (offer.provider) return offer.provider
  if (offer.sourceKind === "company-site") return "strona firmy"
  return offer.sourceKind
}

export function cardFromFeed(offer: FeedOffer | ForYouOffer): OfferCard {
  const card: OfferCard = {
    id: offer.id,
    title: offer.title,
    company: offer.company,
    url: offer.url,
    location: offer.city ?? (offer.inPoland ? "Polska" : null),
    workMode: offer.workMode,
    salary: offer.payLabel,
    source: sourceLabel(offer),
    firstSeen: offer.firstSeenAt.slice(0, 10),
  }
  if ("score" in offer) {
    card.score = offer.score
    card.reasons = offer.reasons.filter((item) => item.kind === "ok").map((item) => item.text)
    card.warnings = offer.reasons.filter((item) => item.kind === "warn").map((item) => item.text)
  }
  return card
}

type Filters = { query?: string; location?: string; workplace?: Workplace; minMonthlyPln?: number }

function browseInput(filters: Filters) {
  return {
    phrase: filters.query,
    location: filters.location,
    mode: filters.workplace && filters.workplace !== "any" ? filters.workplace : undefined,
    pay: filters.minMonthlyPln,
  }
}

/** For-you pages until `limit` offers pass `keep`. Null when there is no profile and no feedback. */
async function rankedForUser(
  userId: number,
  filters: Filters,
  limit: number,
  keep: (offer: ForYouOffer) => boolean = () => true
): Promise<ForYouOffer[] | null> {
  const kept: ForYouOffer[] = []
  for (let page = 1; page <= MAX_FEED_PAGES; page += 1) {
    const result = await listForYou({ ...browseInput(filters), page }, userId, "pl")
    if (!result.hasProfile && !result.hasFeedback) return null
    kept.push(...result.offers.filter(keep))
    if (kept.length >= limit || !result.nextPage) break
  }
  return kept.slice(0, limit)
}

/** Title search over the index (same rules as /jobs). Ranked by For-you when the person has a profile. */
export async function searchJobs(
  args: Filters & { query: string; limit: number; userId: number | null }
): Promise<{ offers: OfferCard[]; ranked: boolean }> {
  if (args.userId) {
    const ranked = await rankedForUser(args.userId, args, args.limit)
    if (ranked) return { offers: ranked.map(cardFromFeed), ranked: true }
  }
  const offers: FeedOffer[] = []
  let cursor: string | undefined
  for (let page = 0; page < 3 && offers.length < args.limit; page += 1) {
    const result = await listOfferPage({ ...browseInput(args), cursor }, "pl")
    offers.push(...result.offers)
    if (!result.nextCursor) break
    cursor = result.nextCursor
  }
  return { offers: offers.slice(0, args.limit).map(cardFromFeed), ranked: false }
}

/** Personal feed; offers already judged are left out by listForYou. */
export async function feedForUser(args: {
  userId: number
  limit: number
  since?: Date
}): Promise<OfferCard[] | null> {
  const since = args.since?.toISOString()
  const ranked = await rankedForUser(args.userId, {}, args.limit, (offer) =>
    since ? offer.firstSeenAt >= since : true
  )
  return ranked ? ranked.map(cardFromFeed) : null
}

export function sinceDate(value: string | undefined, onlyNew: boolean): Date | undefined {
  if (value) {
    const relative = value.trim().match(/^(\d{1,3})\s*d$/i)
    if (relative) return new Date(Date.now() - Number(relative[1]) * 86_400_000)
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) return date
  }
  return onlyNew ? new Date(Date.now() - 7 * 86_400_000) : undefined
}
