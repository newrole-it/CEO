import { z } from "zod"
import { inlineToText } from "./sanitize"
import { matchable } from "./terms"

/**
 * A company brief: what a person should know about an employer before applying and before an
 * interview, along the axes of career-ops' research prompt (modes/deep.md: strategy, recent moves,
 * engineering culture, likely challenges, competitors, the candidate's angle). There it is a
 * prompt for another tool; here it is a brief whose every statement carries its source, and this
 * file is the code that decides what stands.
 *
 * The model proposes; nothing it says is shown on its word:
 * - a point from the offer stands only when its quote is in the offer's text;
 * - a point from the web stands only when its URL is a well-formed https address that is not the
 *   offer's own page, and its quote is on the page newrole.it read at that address itself
 *   (settleWebClaim; the read is src/server/research/web.ts);
 * - a point of the candidate's angle stands only when its quote is in the offer and its evidence
 *   is in the person's own data;
 * - a number in a statement must be in its quote, and headcount, funding, layoffs, ratings and pay
 *   are stated only from a web page whose quote itself speaks of them.
 * Everything else is dropped and counted, never shown.
 *
 * What this does not prove: that the sentence the model wrote follows from the quote (the page
 * shows the quote next to it so the person can judge), or that the page tells the truth.
 */

export const BRIEF_AXES = ["strategy", "moves", "culture", "challenges", "competitors"] as const
export const BriefAxis = z.enum(BRIEF_AXES)
export type BriefAxis = z.infer<typeof BriefAxis>

/** Topics a brief states only with a web page behind them. */
export const SENSITIVE_TOPICS = ["headcount", "funding", "layoffs", "ratings", "pay"] as const
export type SensitiveTopic = (typeof SENSITIVE_TOPICS)[number]

export const LIMIT = {
  /** Points kept on one axis, per source tier */
  perAxis: 3,
  angle: 4,
  questions: 6,
  /** Words a quote needs: fewer prove nothing about a sentence */
  quoteWords: 3,
  quoteChars: 400,
  textChars: 320,
  /** Distinct pages newrole.it reads to check one run's web points */
  webPages: 8,
}

/* ---------------------------------------------------------------- reading text */

const line = (text: string | undefined, max: number) =>
  inlineToText(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

const GAP = /\s*(?:\[\s*(?:…|\.{3})\s*\]|…|\.{3})\s*/

/**
 * True when the text holds the quote word for word, once case, accents, punctuation and spacing
 * are set aside. A quote may skip a stretch with "…": then every part must be there. Unlike
 * quoteIn (./terms), a short quote is not matched by word stems: a source is quoted, not hinted at.
 */
export function quoteFound(text: string, quote: string): boolean {
  const parts = quote
    .split(GAP)
    .map((part) => matchable(part).trim())
    .filter(Boolean)
  const words = parts.reduce((total, part) => total + part.split(" ").length, 0)
  if (!parts.length || words < LIMIT.quoteWords) return false
  const haystack = matchable(text)
  return parts.every((part) => haystack.includes(` ${part} `))
}

/** Every number written in digits, without its separators: "22 000", "22,000" and "22000" are one. */
export function numbersIn(text: string): string[] {
  const found = text.match(/\d+(?:[  .,]\d{3})*(?:[.,]\d+)?/g) ?? []
  return found.map((value) => value.replace(/\D/g, ""))
}

/** True when every number the statement gives is in one of the sources it rests on. */
export function numbersBacked(statement: string, ...sources: string[]): boolean {
  const known = new Set(sources.flatMap(numbersIn))
  return numbersIn(statement).every((value) => known.has(value))
}

/**
 * Words that mark a topic, in English and Polish, read in text folded by `matchable` (lower case,
 * no accents, punctuation as spaces). A hint for a guard, deliberately wide: a point it catches
 * by mistake is dropped, which is the safe side.
 */
const TOPIC: Record<SensitiveTopic, RegExp> = {
  headcount:
    / (employees?|headcount|staff of|people strong|workforce|pracownik\p{L}*|zatrudnia\p{L}*|zatrudnien\p{L}*|etat\p{L}*) /u,
  funding:
    / (funding|funded|raised|raises|series [a-f]|seed round|valuation|valued|investors?|ipo|finansowani\p{L}*|dofinansowani\p{L}*|rund\p{L}* inwestycyjn\p{L}*|pozyskal\p{L}*|wycen\p{L}*|inwestor\p{L}*) /u,
  layoffs:
    / (layoffs?|laid off|lay off|redundanc\p{L}*|downsiz\p{L}*|job cuts|zwolnien\p{L}*|zwolnil\p{L}*|zwalnia\p{L}*|redukcj\p{L}*) /u,
  ratings:
    / (glassdoor|gowork|kununu|teamblind|rated|ratings?|stars?|employee reviews|out of 5|opini\p{L}* pracownik\p{L}*|gwiazd\p{L}*|ocen\p{L}* pracownik\p{L}*) /u,
  pay: / (salary|salaries|compensation|pay range|wynagrodzen\p{L}*|pensj\p{L}*|widel\p{L}*|zarobk\p{L}*|zarabia\p{L}*|stawk\p{L}*) /u,
}

/** An amount of money: a currency sign or code next to a number. */
const MONEY =
  /[$€£]\s?\d|\d\s?(?:k|tys\.?|mln|m|bn)?\s?(?:[$€£]|(?:pln|zł|zl|usd|eur|gbp|chf)(?!\p{L}))/iu

/** The sensitive topics a text speaks of. */
export function sensitiveTopics(text: string): SensitiveTopic[] {
  const folded = matchable(text)
  const topics = SENSITIVE_TOPICS.filter((topic) => TOPIC[topic].test(folded))
  if (!topics.includes("pay") && MONEY.test(text)) topics.push("pay")
  return topics
}

/* ---------------------------------------------------------------- what is kept */

export const OfferSource = z.object({ kind: z.literal("offer"), quote: z.string() })
export const WebSource = z.object({
  kind: z.literal("web"),
  url: z.string(),
  host: z.string(),
  quote: z.string(),
  /** The page is on the company's own domain. Nothing is claimed about any other page. */
  own: z.boolean(),
  /** When newrole.it read the page and found the quote on it (ISO) */
  checkedAt: z.string(),
})
export type OfferSource = z.infer<typeof OfferSource>
export type WebSource = z.infer<typeof WebSource>

export const BriefPoint = z.object({
  axis: BriefAxis,
  /** The model's sentence, in the language of the brief */
  text: z.string(),
  source: z.discriminatedUnion("kind", [OfferSource, WebSource]),
})
export type BriefPoint = z.infer<typeof BriefPoint>

export const AnglePoint = z.object({
  text: z.string(),
  /** What the offer asks for, in its words */
  offerQuote: z.string(),
  /** What the person's CV or profile says, in their words */
  evidence: z.string(),
})
export type AnglePoint = z.infer<typeof AnglePoint>

export const BriefQuestion = z.object({
  text: z.string(),
  /** The phrase of the offer that prompts it, when one does */
  quote: z.string().optional(),
})
export type BriefQuestion = z.infer<typeof BriefQuestion>

/** Why the offer's text gave no points. */
export const OfferTierState = z.enum(["done", "no-text", "withheld", "failed"])
export type OfferTierState = z.infer<typeof OfferTierState>

/**
 * How the web research went. "provider": the configured model cannot search the web.
 * "not-asked": the person left it out. "failed": the run gave nothing readable.
 */
export const WebTierState = z.enum(["done", "provider", "not-asked", "failed"])
export type WebTierState = z.infer<typeof WebTierState>

/** Why newrole.it could not read a page the model cited; what the model said from it is not shown. */
export const UnreadReason = z.enum(["blocked", "failed", "opt-out", "not-text", "limit"])
export type UnreadReason = z.infer<typeof UnreadReason>

export const CompanyBriefResult = z.object({
  version: z.literal(1),
  points: z.array(BriefPoint),
  angle: z.array(AnglePoint),
  questions: z.array(BriefQuestion),
  offer: OfferTierState,
  web: z.object({
    state: WebTierState,
    /** Web searches the model ran, counted from its tool calls; null when not counted */
    searches: z.number().nullable(),
    searchCap: z.number(),
    /** Pages the model cited that newrole.it could not read */
    unread: z.array(z.object({ url: z.string(), reason: UnreadReason })),
  }),
  /** What the model proposed and code did not keep */
  dropped: z.object({
    offer: z.number(),
    web: z.number(),
    angle: z.number(),
    questions: z.number(),
  }),
})
export type CompanyBriefResult = z.infer<typeof CompanyBriefResult>

/** A stored brief; null when it is of another version or no longer reads. */
export function parseCompanyBrief(value: unknown): CompanyBriefResult | null {
  const parsed = CompanyBriefResult.safeParse(value)
  return parsed.success ? parsed.data : null
}

/* ---------------------------------------------------------------- the offer's tier */

export const OfferBriefReply = z.object({
  points: z
    .array(
      z.object({
        axis: BriefAxis,
        text: z.string().max(1000),
        quote: z.string().max(1500),
      })
    )
    .max(40)
    .catch([]),
  angle: z
    .array(
      z.object({
        text: z.string().max(1000),
        offerQuote: z.string().max(1500),
        evidence: z.string().max(1500),
      })
    )
    .max(20)
    .catch([]),
  questions: z
    .array(
      z.object({
        text: z.string().max(1000),
        quote: z.string().max(1500).optional().catch(undefined),
      })
    )
    .max(20)
    .catch([]),
})
export type OfferBriefReply = z.infer<typeof OfferBriefReply>

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = matchable(key(item)).trim()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

/** At most LIMIT.perAxis points an axis, in the axes' order, the model's order kept within one. */
function capPerAxis<T extends { axis: BriefAxis }>(points: T[]): T[] {
  return BRIEF_AXES.flatMap((axis) =>
    points.filter((point) => point.axis === axis).slice(0, LIMIT.perAxis)
  )
}

export type OfferBrief = {
  points: BriefPoint[]
  angle: AnglePoint[]
  questions: BriefQuestion[]
  dropped: { offer: number; angle: number; questions: number }
}

/**
 * The model's reading of the offer, kept to what the offer and the person's data show.
 * `evidence` is everything the person has said about themselves (their CV's text and profile).
 */
export function cleanOfferBrief(
  reply: OfferBriefReply,
  input: { offerText: string; evidence: string }
): OfferBrief {
  const { offerText, evidence } = input

  const points = capPerAxis(
    unique(
      reply.points
        .map((item) => ({
          axis: item.axis,
          text: line(item.text, LIMIT.textChars),
          quote: line(item.quote, LIMIT.quoteChars),
        }))
        .filter(
          (item) =>
            item.text &&
            quoteFound(offerText, item.quote) &&
            numbersBacked(item.text, item.quote) &&
            // these need a web page behind them, whatever the offer says of itself
            sensitiveTopics(item.text).length === 0
        ),
      (item) => item.text
    )
  ).map(
    (item): BriefPoint => ({
      axis: item.axis,
      text: item.text,
      source: { kind: "offer", quote: item.quote },
    })
  )

  const angle = unique(
    reply.angle
      .map((item) => ({
        text: line(item.text, LIMIT.textChars),
        offerQuote: line(item.offerQuote, LIMIT.quoteChars),
        evidence: line(item.evidence, LIMIT.quoteChars),
      }))
      .filter(
        (item) =>
          item.text &&
          quoteFound(offerText, item.offerQuote) &&
          quoteFound(evidence, item.evidence) &&
          numbersBacked(item.text, item.offerQuote, item.evidence)
      ),
    (item) => item.text
  ).slice(0, LIMIT.angle)

  const questions = unique(
    reply.questions
      .map((item) => {
        const quote = line(item.quote, LIMIT.quoteChars)
        return {
          text: line(item.text, LIMIT.textChars),
          // a phrase the offer does not hold is not shown; the question may still stand
          quote: quote && quoteFound(offerText, quote) ? quote : "",
        }
      })
      .filter((item) => item.text.endsWith("?") && questionAssertsNothing(item.text, item.quote)),
    (item) => item.text
  )
    .slice(0, LIMIT.questions)
    .map((item): BriefQuestion => (item.quote ? item : { text: item.text }))

  return {
    points,
    angle,
    questions,
    dropped: {
      offer: reply.points.length - points.length,
      angle: reply.angle.length - angle.length,
      questions: reply.questions.length - questions.length,
    },
  }
}

/**
 * A question must not carry a fact in: "why did you lay off a third of the team?" states one.
 * So it gives no number the offer's phrase does not hold, and does not speak of headcount,
 * funding, layoffs or ratings. Pay may be asked about.
 */
function questionAssertsNothing(text: string, quote: string): boolean {
  if (!numbersBacked(text, quote)) return false
  return sensitiveTopics(text).every((topic) => topic === "pay")
}

/* ---------------------------------------------------------------- the web's tier */

export const WebBriefReply = z.object({
  points: z
    .array(
      z.object({
        axis: BriefAxis,
        text: z.string().max(1000),
        url: z.string().max(2000),
        quote: z.string().max(1500),
      })
    )
    .max(60)
    .catch([]),
})
export type WebBriefReply = z.infer<typeof WebBriefReply>

/** A web point that passed every check that needs no network; its page is still to be read. */
export type WebClaim = { axis: BriefAxis; text: string; url: string; host: string; quote: string }

const hostOf = (host: string) =>
  host
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "")

/** A page's address without what does not name it: scheme, "www.", query, fragment, last slash. */
export function pageKey(raw: string): string | null {
  try {
    const url = new URL(raw)
    return `${hostOf(url.hostname)}${url.pathname.replace(/\/+$/, "")}`.toLowerCase()
  } catch {
    return null
  }
}

/**
 * A public https address a person could open: no credentials, no port, a host name with a dot
 * that is not an IP address. The fragment is cut. Null for anything else.
 */
export function sourceUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null
  const host = url.hostname
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) || /^[\d.]+$/.test(host)) return null
  url.hash = ""
  return url
}

/** True when the host is the domain or under it. */
export function onDomain(host: string, domain: string | null | undefined): boolean {
  const own = hostOf(domain ?? "")
  const clean = hostOf(host)
  return Boolean(own) && (clean === own || clean.endsWith(`.${own}`))
}

/**
 * The model's web points, kept to those worth reading a page for: a usable https address that is
 * not the offer's own page, a quote long enough to check, every number of the sentence in the
 * quote, and a sensitive topic only when the quote itself speaks of it. `offerUrls` are the
 * addresses of the offer.
 */
export function screenWebClaims(
  reply: WebBriefReply,
  input: { offerUrls: (string | null | undefined)[] }
): { claims: WebClaim[]; dropped: number } {
  const offerPages = new Set(input.offerUrls.map((url) => (url ? pageKey(url) : null)))
  const claims = unique(
    reply.points.flatMap((item): WebClaim[] => {
      const url = sourceUrl(item.url)
      const text = line(item.text, LIMIT.textChars)
      const quote = line(item.quote, LIMIT.quoteChars)
      if (!url || !text || offerPages.has(pageKey(url.toString()))) return []
      if (matchable(quote).trim().split(" ").length < LIMIT.quoteWords) return []
      if (!numbersBacked(text, quote)) return []
      const said = sensitiveTopics(quote)
      if (!sensitiveTopics(text).every((topic) => said.includes(topic))) return []
      return [{ axis: item.axis, text, url: url.toString(), host: hostOf(url.hostname), quote }]
    }),
    (item) => `${item.text} ${item.url}`
  )
  return { claims, dropped: reply.points.length - claims.length }
}

/**
 * True when the page is the company's own or names the company. A quote found on a page about
 * some other firm proves nothing about this one.
 */
export function pageAboutCompany(
  page: { host: string; text: string },
  company: { names: string[]; domain: string | null }
): boolean {
  if (onDomain(page.host, company.domain)) return true
  const haystack = matchable(page.text)
  return company.names.some((name) => {
    const needle = matchable(name).trim()
    return needle.replace(/ /g, "").length >= 3 && haystack.includes(` ${needle} `)
  })
}

/**
 * One web claim against the page newrole.it read at its address: kept when the quote is on the
 * page and the page is about the company, null otherwise.
 */
export function settleWebClaim(
  claim: WebClaim,
  page: { text: string },
  company: { names: string[]; domain: string | null },
  checkedAt: Date
): BriefPoint | null {
  if (!quoteFound(page.text, claim.quote)) return null
  if (!pageAboutCompany({ host: claim.host, text: page.text }, company)) return null
  return {
    axis: claim.axis,
    text: claim.text,
    source: {
      kind: "web",
      url: claim.url,
      host: claim.host,
      quote: claim.quote,
      own: onDomain(claim.host, company.domain),
      checkedAt: checkedAt.toISOString(),
    },
  }
}

/** The offer's points, then the web's, capped per axis within each tier. */
export function mergePoints(offer: BriefPoint[], web: BriefPoint[]): BriefPoint[] {
  const merged = [...offer, ...capPerAxis(web)]
  return BRIEF_AXES.flatMap((axis) => merged.filter((point) => point.axis === axis))
}

/** The axes the brief says nothing on: each is an unknown, and a question worth asking. */
export function unknownAxes(points: BriefPoint[]): BriefAxis[] {
  return BRIEF_AXES.filter((axis) => !points.some((point) => point.axis === axis))
}
