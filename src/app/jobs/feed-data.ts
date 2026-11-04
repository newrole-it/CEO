/**
 * Server-side feed loading for /jobs: wraps the matching agent's listForYou / listOfferPage,
 * passes the UI-only filters (seniority, company sites, salary listed, fresh, company) into the
 * scan so every page fills up, and adds what the cards need (companyId, seniority).
 */
import db from "db"
import { listForYou, listOfferPage, type BrowseInput, type KeepOffer } from "src/server/jobs/browse"
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
  /** More offers match than `total` counts (For you ranks a limited pool). */
  capped: boolean
  hasProfile: boolean
  hasFeedback: boolean
}

function levelOf(title: string, stored: string | null): Level | null {
  const level = seniorityOf(title, stored)
  return level ? LEVEL_OF[level] ?? null : null
}

/** The filters the browse query has no column for, as a test the scan runs on every offer. */
export function keepFor(filters: FeedFilters): ((offer: KeepOffer) => boolean) | undefined {
  const { levels, companyOnly, payOnly } = filters
  if (!levels.length && !companyOnly && !payOnly) return undefined
  return (offer) => {
    if (levels.length) {
      const level = levelOf(offer.title, offer.seniorityLevel)
      if (!level || !levels.includes(level)) return false
    }
    if (companyOnly && offer.sourceKind !== "company-site" && offer.sourceKind !== "ats")
      return false
    if (payOnly && !offer.payListed) return false
    return true
  }
}

function browseInput(filters: FeedFilters, defaultCountry: string | null): BrowseInput {
  return {
    tags: filters.tags,
    country: filters.country || undefined,
    defaultCountry,
    remoteHere: filters.remoteHere,
    city: filters.city,
    mode: filters.mode,
    pay: filters.pay ?? undefined,
    companyId: filters.company || undefined,
    seenSince: filters.fresh ? new Date(Date.now() - 7 * 86_400_000) : undefined,
    keep: keepFor(filters),
  }
}

async function decorate(offers: CardOffer[], userId: number | null): Promise<FeedCard[]> {
  if (!offers.length) return []
  const ids = offers.map((offer) => offer.id)
  const [rows, tailored] = await Promise.all([
    db.job.findMany({
      where: { id: { in: ids } },
      select: { id: true, companyId: true, seniorityLevel: true, title: true },
    }),
    userId
      ? db.cvDocument.findMany({
          where: { userId, docType: "CV", jobId: { in: ids } },
          select: { jobId: true },
        })
      : [],
  ])
  const meta = new Map(rows.map((row) => [row.id, row]))
  const withCv = new Set(tailored.map((row) => row.jobId))
  return offers.map((offer) => {
    const row = meta.get(offer.id)
    return {
      ...offer,
      companyId: row?.companyId ?? null,
      level: row ? levelOf(row.title, row.seniorityLevel) : null,
      hasCv: withCv.has(offer.id),
    }
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
      { ...browseInput(filters, defaultCountry), page, sort: filters.sort },
      userId,
      locale
    )
    return {
      offers: await decorate(result.offers, userId),
      next: result.nextPage ? String(result.nextPage) : null,
      total: result.total,
      capped: result.capped,
      hasProfile: result.hasProfile,
      hasFeedback: result.hasFeedback,
    }
  }
  const result = await listOfferPage(
    { ...browseInput(filters, defaultCountry), cursor: args.next ?? undefined },
    locale
  )
  return {
    offers: await decorate(result.offers, userId),
    next: result.nextCursor,
    total: null,
    capped: false,
    hasProfile: false,
    hasFeedback: false,
  }
}
