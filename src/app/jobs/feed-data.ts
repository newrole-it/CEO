/**
 * Server-side feed loading for /jobs: wraps the matching agent's listForYou / listOfferPage,
 * adds what the cards need (companyId, seniority) and applies the UI-only filters
 * (seniority, company sites, salary listed, fresh, company).
 */
import db from "db"
import { listForYou, listOfferPage, type BrowseInput } from "src/server/jobs/browse"
import { seniorityOf } from "src/server/preferences/facts"
import type { FeedFilters, Level } from "./feed-filters"
import type { CardOffer, FeedTab } from "./types"

export type { FeedFilters }

const LEVEL_OF: Record<string, Level> = {
  intern: "junior",
  junior: "junior",
  mid: "mid",
  senior: "senior",
  lead: "lead",
  principal: "lead",
  manager: "head",
  senior_manager: "head",
  director: "head",
  head: "head",
  vp: "head",
  c_level: "head",
}

export type FeedCard = CardOffer & { companyId: string | null; level: Level | null }

export type FeedChunk = {
  offers: FeedCard[]
  /** page number (For you) or cursor (All); null at the end. */
  next: string | null
  total: number | null
  hasProfile: boolean
  hasFeedback: boolean
}

function browseInput(filters: FeedFilters, defaultCountry: string | null): BrowseInput {
  return {
    q: filters.q,
    country: filters.country || undefined,
    defaultCountry,
    city: filters.city,
    mode: filters.mode,
    pay: filters.pay ?? undefined,
  }
}

async function decorate(offers: CardOffer[], filters: FeedFilters): Promise<FeedCard[]> {
  if (!offers.length) return []
  const rows = await db.job.findMany({
    where: { id: { in: offers.map((offer) => offer.id) } },
    select: { id: true, companyId: true, seniorityLevel: true, title: true },
  })
  const meta = new Map(rows.map((row) => [row.id, row]))
  const freshSince = Date.now() - 7 * 86_400_000
  return offers
    .map((offer) => {
      const row = meta.get(offer.id)
      const level = row ? seniorityOf(row.title, row.seniorityLevel) : null
      return {
        ...offer,
        companyId: row?.companyId ?? null,
        level: level ? LEVEL_OF[level] ?? null : null,
      }
    })
    .filter((offer) => {
      if (filters.levels.length && (!offer.level || !filters.levels.includes(offer.level)))
        return false
      if (filters.companyOnly && offer.sourceKind !== "company-site" && offer.sourceKind !== "ats")
        return false
      if (filters.payOnly && !offer.payListed) return false
      if (filters.fresh && new Date(offer.firstSeenAt).getTime() < freshSince) return false
      if (filters.company && offer.companyId !== filters.company) return false
      return true
    })
}

/** One chunk of the feed. `next` is the page number (For you) or the cursor (All). */
export async function loadFeed(args: {
  tab: FeedTab
  filters: FeedFilters
  next?: string | null
  userId: number | null
  locale: "pl" | "en"
  /** Used when the filters pick no country: the person's own (see src/server/jobs/country.ts). */
  defaultCountry: string | null
}): Promise<FeedChunk> {
  const { tab, filters, userId, locale, defaultCountry } = args
  if (tab === "foryou") {
    const page = Number(args.next ?? 1) || 1
    const result = await listForYou(
      { ...browseInput(filters, defaultCountry), page },
      userId,
      locale
    )
    let offers = await decorate(result.offers, filters)
    if (filters.sort === "new") {
      offers = [...offers].sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt))
    }
    return {
      offers,
      next: result.nextPage ? String(result.nextPage) : null,
      total: result.total,
      hasProfile: result.hasProfile,
      hasFeedback: result.hasFeedback,
    }
  }
  const result = await listOfferPage(
    { ...browseInput(filters, defaultCountry), cursor: args.next ?? undefined },
    locale
  )
  return {
    offers: await decorate(result.offers, filters),
    next: result.nextCursor,
    total: null,
    hasProfile: false,
    hasFeedback: false,
  }
}
