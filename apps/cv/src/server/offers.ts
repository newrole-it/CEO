import { detectLanguage } from "@newrole/cv-core/language"
import { OFFER_TEXT_LIMIT, type OfferTextOrigin } from "@newrole/cv-core/tailor"
import { excerpt } from "@newrole/offers/hygiene"
import { createSafeFetch, httpClientOf, type HttpClient } from "@newrole/offers/http"
import { readPosting } from "@newrole/offers/posting"
import { createOffer, type Offer } from "./store"

/**
 * Offers from a link: read politely (source policy, robots.txt, one request per second per host),
 * kept on disk as an excerpt, and the whole text held in memory for a quarter of an hour.
 */

const DEFAULT_USER_AGENT =
  "NewroleCV/0.1 (+https://github.com/newrole-it/CEO; one person tailoring their own CV)"

let client: HttpClient | null = null

export function offerHttp(): HttpClient {
  client ??= httpClientOf(
    createSafeFetch({ userAgent: () => process.env.CV_USER_AGENT?.trim() || DEFAULT_USER_AGENT })
  )
  return client
}

const TEXT_TTL_MS = 15 * 60_000
const texts = new Map<string, { text: string; until: number }>()

function remember(offerId: string, text: string): void {
  texts.set(offerId, { text, until: Date.now() + TEXT_TTL_MS })
  for (const [id, entry] of texts) if (entry.until < Date.now()) texts.delete(id)
}

export class OfferError extends Error {
  constructor(
    /** link-only: the site may not be read (LinkedIn, a job board, robots.txt) */
    readonly code: "link-only" | "unreadable",
    message: string
  ) {
    super(message)
  }
}

export async function addOfferFromLink(url: string, http = offerHttp()): Promise<Offer> {
  const read = await readPosting(url, http)
  if (!read.ok) throw new OfferError(read.linkOnly ? "link-only" : "unreadable", read.reason)
  const { posting } = read
  const text = posting.text.slice(0, OFFER_TEXT_LIMIT)
  const offer = await createOffer({
    url: posting.url,
    company: posting.company.slice(0, 160),
    title: posting.title.slice(0, 200),
    location: posting.location?.slice(0, 200) ?? null,
    excerpt: excerpt(text),
    withheld: posting.withheld,
    // read here, not sent anywhere: an opted-out offer can still set the language
    language: detectLanguage(`${posting.title}\n${text}`),
  })
  if (text) remember(offer.id, text)
  return offer
}

/** An offer the person names themselves; its text comes with each request as their note. */
export function addOfferByHand(input: {
  company: string
  title: string
  location?: string | null
}): Promise<Offer> {
  return createOffer({
    url: null,
    company: input.company.trim().slice(0, 160),
    title: input.title.trim().slice(0, 200),
    location: input.location?.trim().slice(0, 200) || null,
    excerpt: "",
    withheld: false,
    language: detectLanguage(`${input.company}\n${input.title}`),
  })
}

/**
 * The offer's text for a model, read from its page again when the memory has none. Never throws:
 * when the page cannot be read the excerpt is used, and `origin` says so.
 */
export async function offerText(
  offer: Offer,
  http = offerHttp()
): Promise<{ text: string; origin: OfferTextOrigin }> {
  if (offer.withheld) return { text: "", origin: "withheld" }
  const known = texts.get(offer.id)
  if (known && known.until > Date.now()) return { text: known.text, origin: "full" }
  if (offer.url) {
    const read = await readPosting(offer.url, http)
    if (read.ok && read.posting.withheld) return { text: "", origin: "withheld" }
    const text = read.ok ? read.posting.text.slice(0, OFFER_TEXT_LIMIT) : ""
    if (text) {
      remember(offer.id, text)
      return { text, origin: "full" }
    }
  }
  return offer.excerpt ? { text: offer.excerpt, origin: "excerpt" } : { text: "", origin: "none" }
}
