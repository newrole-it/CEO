import { z } from "zod"
import { defaultConsent, type CvLocale } from "./blank"
import { MatchNotes } from "./match"
import { inlineToText, sanitizeInline } from "./sanitize"
import { cvId, parseCvContent, type CvContent, type CvSection } from "./schema"
import { hasTerm, matchable, TECH_SHAPED } from "./terms"
import { cvPlainText } from "./text"

export { mentionsTerm } from "./terms"

/**
 * Tailoring a CV to one offer. The model never writes the CV: it proposes wording and order for
 * named fields, and applyTailoring decides what of that may land. Identity stays out of its
 * reach (company, school, contact details, photo, order of roles), every role survives, and a
 * field that gains a number the person's data does not have keeps its old text. What cannot be
 * decided by rule, such as a new technology name, is listed for the person to check.
 */

const optional = (max: number) => z.string().max(max).optional()

const ReplyItem = z.object({
  id: z.string().max(64),
  label: optional(600),
  text: optional(6000),
  role: optional(600),
  dates: optional(300),
  summary: optional(12000),
  bullets: z.array(z.string().max(6000)).max(80).optional(),
  tech: optional(6000),
  title: optional(600),
  body: optional(12000),
  degree: optional(900),
})

const ReplySection = z.object({
  id: z.string().max(64),
  title: optional(400),
  body: optional(36000),
  hide: z.boolean().optional(),
  items: z.array(ReplyItem).max(120).optional(),
})

const ReplyKeyword = z.object({
  term: z.string().max(300),
  /** The candidate's own words that show the term; empty when nothing does */
  evidence: z.string().max(2000).optional(),
})

export const TailorReply = z.object({
  headline: optional(900),
  sections: z.array(ReplySection).max(60),
  changes: z.array(z.string().max(600)).max(20).catch([]),
  gaps: z.array(z.string().max(600)).max(20).catch([]),
  keywords: z.array(ReplyKeyword).max(40).catch([]),
})
export type TailorReply = z.infer<typeof TailorReply>

/** full: read from the source just now. excerpt: only what the index keeps. withheld: the site opts out of AI. */
export const OfferTextOrigin = z.enum(["full", "excerpt", "none", "withheld"])
export type OfferTextOrigin = z.infer<typeof OfferTextOrigin>

/** The most of an offer's text a tailoring or a letter reads. */
export const OFFER_TEXT_LIMIT = 12_000

/**
 * Where one of the offer's key terms ended up. kept: the CV had it already. added: tailoring put
 * it in. unplaced: the person's CV or profile shows it, the tailored CV does not. missing: their
 * data does not show it.
 */
export const KeywordStatus = z.enum(["kept", "added", "unplaced", "missing"])
export type KeywordStatus = z.infer<typeof KeywordStatus>
export type KeywordNote = { term: string; status: KeywordStatus }

export const TailorNotes = z.object({
  changes: z.array(z.string()),
  gaps: z.array(z.string()),
  /** Names in the new text that the person's CV and profile do not have */
  unverified: z.array(z.string()),
  /** The offer's key terms, most important first. Documents tailored before this have none. */
  keywords: z.array(z.object({ term: z.string(), status: KeywordStatus })).optional(),
  /** Fields that kept their old text because the model added a number */
  reverted: z.number(),
  /** False when the model saw only the company and title, not the offer's text */
  usedJobText: z.boolean(),
  /** How much of the offer the model read. Documents written before this was recorded have none. */
  offerText: z.object({ origin: OfferTextOrigin, chars: z.number(), note: z.boolean() }).optional(),
  /**
   * The offer's analysis, the match with it and the checks before and after (./match), for the
   * match dashboard. Documents tailored before this have none; one that no longer parses is
   * dropped rather than losing the other notes.
   */
  match: MatchNotes.optional().catch(undefined),
})
export type TailorNotes = z.infer<typeof TailorNotes>

export function parseTailorNotes(value: unknown): TailorNotes | null {
  const parsed = TailorNotes.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The model worked from a fragment of the offer, and the person did not paste the rest. */
export function readOnlyExcerpt(notes: TailorNotes): boolean {
  return notes.offerText?.origin === "excerpt" && !notes.offerText.note
}

/** The CV as the model sees it: visible text with ids, without photo, contact details or theme. */
export function cvForModel(content: CvContent) {
  return {
    headline: content.header.headline,
    sections: content.sections
      .filter((section) => !section.hidden)
      .map((section) => {
        const head = { id: section.id, type: section.type, title: section.title }
        if (section.type === "text") return { ...head, body: section.body }
        if (section.type === "letter") return head
        return { ...head, items: section.items }
      }),
  }
}

/* ---------------------------------------------------------------- guards */

const NUMBER = /\d+(?:[.,]\d+)*/g

const numbersIn = (text: string) =>
  (text.match(NUMBER) ?? []).map((value) => value.replace(/,/g, "."))

/** Every number the evidence has, whole and in parts: "01.2024" also backs "2024". */
function knownNumbers(evidence: string): Set<string> {
  const known = new Set<string>()
  for (const value of numbersIn(evidence)) {
    known.add(value)
    for (const part of value.split(".")) known.add(part)
  }
  return known
}

/** A link the model added is reduced to its text: it read the offer, which may ask for one. */
function withoutNewLinks(html: string, allowed: Set<string>): string {
  return html.replace(/<a href="([^"]*)">([\s\S]*?)<\/a>/g, (whole, href: string, inner: string) =>
    allowed.has(href) ? whole : inner
  )
}

function linksIn(content: CvContent): Set<string> {
  const json = JSON.stringify(content.sections).replace(/\\"/g, '"')
  return new Set([...json.matchAll(/<a href="([^"]*)">/g)].map((match) => match[1]))
}

const NAME_SHAPED = /^[A-ZĄĆĘŁŃÓŚŹŻ][a-ząćęłńóśźż]{2,}$/

/**
 * Tool and product names in the text that the evidence does not have: anything shaped like one
 * (PostgreSQL, K8s, C#, Node.js) and, in the CV's own language, capitalised words inside a
 * sentence. A capitalised word counts as known by its stem, so "Firmie" is covered by "Firma":
 * Polish names change their endings. A hint to look at them, not a verdict.
 */
export function unverifiedTerms(
  written: string[],
  evidence: string,
  opts: { translated?: boolean } = {}
): string[] {
  const known = evidence.toLowerCase()
  const found = new Map<string, string>()
  for (const text of written) {
    for (const line of text.split("\n")) {
      let sentenceStart = true
      for (const raw of line.split(/[\s,;:()/|·•–—]+/)) {
        if (!raw) continue
        const token = raw.replace(/^["'„“]+|["'”.!?]+$/g, "")
        const endsSentence = /[.!?]["'”]?$/.test(raw)
        // no name is this long, and the patterns below should not have to walk such a string
        if (token.length > 60) continue
        const techShaped = TECH_SHAPED.test(token)
        const candidate =
          techShaped || (!opts.translated && !sentenceStart && NAME_SHAPED.test(token))
        sentenceStart = endsSentence
        if (!candidate || /^\d/.test(token)) continue
        const key = token.toLowerCase()
        const needle = techShaped ? key : key.slice(0, Math.max(4, key.length - 3))
        if (!known.includes(needle) && !found.has(key)) found.set(key, token)
      }
    }
  }
  return [...found.values()].slice(0, 12)
}

/** Numbers in the text that the evidence does not have, for text with no old value to fall back on. */
export function unverifiedNumbers(written: string[], evidence: string): string[] {
  const known = knownNumbers(evidence)
  const found = written.flatMap(numbersIn).filter((value) => !known.has(value))
  return [...new Set(found)]
}

/* ---------------------------------------------------------------- keywords */

const MAX_KEYWORDS = 15

/**
 * The offer's key terms the model listed, checked by code: whether the tailored CV has each one,
 * and whether the person's data backs it, by the term itself or by the words the model quoted as
 * evidence. A term in the CV that nothing backs is returned in `unsupported`.
 */
export function keywordNotes(
  keywords: TailorReply["keywords"],
  texts: { before: string; after: string; evidence: string }
): { keywords: KeywordNote[]; unsupported: string[] } {
  const before = matchable(texts.before)
  const after = matchable(texts.after)
  const known = matchable(texts.evidence)
  const seen = new Set<string>()
  const notes: KeywordNote[] = []
  const unsupported: string[] = []
  for (const keyword of keywords) {
    const term = inlineToText(keyword.term).replace(/\s+/g, " ").trim()
    const key = matchable(term).trim()
    if (!key || term.length > 80 || seen.has(key)) continue
    seen.add(key)
    const quote = matchable(inlineToText(keyword.evidence ?? "")).trim()
    const backed = hasTerm(known, term) || (quote.length >= 3 && known.includes(` ${quote} `))
    const inCv = hasTerm(after, term)
    const status: KeywordStatus = inCv
      ? hasTerm(before, term)
        ? "kept"
        : "added"
      : backed
      ? "unplaced"
      : "missing"
    if (inCv && !backed) unsupported.push(term)
    notes.push({ term, status })
    if (notes.length === MAX_KEYWORDS) break
  }
  return { keywords: notes, unsupported }
}

/**
 * Keyword statuses after a later step (the bullet check) changed the CV: a term it no longer
 * shows is unplaced, one the person's data backs and it now shows is added.
 */
export function refreshKeywordNotes(
  keywords: KeywordNote[] | undefined,
  content: CvContent
): KeywordNote[] | undefined {
  if (!keywords) return keywords
  const text = matchable(cvPlainText(content))
  return keywords.map((note): KeywordNote => {
    const inCv = hasTerm(text, note.term)
    if (inCv && note.status === "unplaced") return { ...note, status: "added" }
    if (!inCv && (note.status === "kept" || note.status === "added"))
      return { ...note, status: "unplaced" }
    return note
  })
}

/* ---------------------------------------------------------------- merge */

/** The schema's limits for the fields the model may write. */
const MAX = { body: 12000, summary: 4000, bullet: 2000, tech: 2000, skill: 2000, card: 4000 }
/** The schema's limit on cards in one section */
const MAX_CARDS = 30

/** Reads the model's proposals against the old values and keeps count of what it refused. */
function createWriter(base: CvContent, evidence: string) {
  const known = knownNumbers(evidence)
  const words = matchable(evidence)
  const links = linksIn(base)
  const written: string[] = []
  let reverted = 0

  const addsNumber = (text: string) => numbersIn(text).some((value) => !known.has(value))

  /** Rich text: sanitized, without new links; undefined means "refused or nothing proposed". */
  function rich(next: string | undefined, max: number): string | undefined {
    if (next === undefined) return undefined
    const clean = sanitizeInline(withoutNewLinks(sanitizeInline(next), links))
    const text = inlineToText(clean)
    if (!text.trim()) return undefined
    if (clean.length > max || addsNumber(text)) {
      reverted += 1
      return undefined
    }
    written.push(text)
    return clean
  }

  function plain(next: string | undefined, max: number): string | undefined {
    if (next === undefined) return undefined
    const clean = inlineToText(next).replace(/\s+/g, " ").trim()
    if (!clean) return undefined
    if (clean.length > max || addsNumber(clean)) {
      reverted += 1
      return undefined
    }
    written.push(clean)
    return clean
  }

  /** Dates may change words ("obecnie" to "Present") but never their digits. */
  function dates(next: string | undefined, current: string): string {
    const digits = (value: string) => (value.match(/\d+/g) ?? []).join(",")
    const clean = inlineToText(next ?? "")
      .replace(/\s+/g, " ")
      .trim()
    return clean && clean.length <= 100 && digits(clean) === digits(current) ? clean : current
  }

  /** The person's data names it: a new card may only be about something they have said. */
  const backs = (name: string) => hasTerm(words, name)

  return { rich, plain, dates, backs, written, reverted: () => reverted }
}

type Writer = ReturnType<typeof createWriter>
type ProposedSection = TailorReply["sections"][number]
type ProposedItem = NonNullable<ProposedSection["items"]>[number]

/**
 * Items in the proposed order, without those it left out; all of them when it names none. An id
 * the section does not have becomes a new item only through `create`, which may refuse it.
 */
function picked<T extends { id: string }>(
  items: T[],
  proposals: ProposedItem[] | undefined,
  merge: (item: T, proposal: ProposedItem) => T,
  create?: (proposal: ProposedItem) => T | undefined
): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  let named = 0
  for (const proposal of proposals ?? []) {
    const item = items.find((entry) => entry.id === proposal.id)
    if (item && seen.has(item.id)) continue
    if (item) seen.add(item.id)
    const next = item ? merge(item, proposal) : create?.(proposal)
    if (!next) continue
    if (item) named += 1
    out.push(next)
  }
  return named ? out : [...items, ...out]
}

function mergeSection(
  section: CvSection,
  proposal: ProposedSection,
  writer: Writer,
  translate: boolean
): CvSection {
  const title = translate ? writer.plain(proposal.title, 120) ?? section.title : section.title
  const byId = new Map((proposal.items ?? []).map((item) => [item.id, item]))

  if (section.type === "text") {
    if (proposal.hide) return { ...section, hidden: true }
    return { ...section, title, body: writer.rich(proposal.body, MAX.body) ?? section.body }
  }
  if (section.type === "skills") {
    if (proposal.hide) return { ...section, hidden: true }
    const items = picked(section.items, proposal.items, (item, next) => ({
      ...item,
      label: writer.plain(next.label, 160) ?? item.label,
      text: writer.rich(next.text, MAX.skill) ?? item.text,
    }))
    return { ...section, title, items }
  }
  if (section.type === "cards") {
    if (proposal.hide) return { ...section, hidden: true }
    const items = picked(
      section.items,
      proposal.items,
      (item, next) => ({
        ...item,
        title: translate ? writer.plain(next.title, 240) ?? item.title : item.title,
        body: writer.rich(next.body, MAX.card) ?? item.body,
      }),
      // a project the person's data names but this CV does not show yet
      (next) => {
        const name = inlineToText(next.title ?? "")
          .split("·")[0]
          .trim()
        if (!name || !writer.backs(name)) return undefined
        const cardTitle = writer.plain(next.title, 240)
        const body = writer.rich(next.body, MAX.card)
        return cardTitle && body ? { id: cvId("i"), title: cardTitle, body } : undefined
      }
    ).slice(0, MAX_CARDS)
    return { ...section, title, items }
  }
  if (section.type === "experience") {
    // every role stays, in its place: a gap in the history would be a change of fact
    const items = section.items.map((item) => {
      const next = byId.get(item.id)
      if (!next) return item
      const bullets = (next.bullets ?? [])
        .map((bullet) => writer.rich(bullet, MAX.bullet))
        .filter((bullet): bullet is string => Boolean(bullet))
        .slice(0, 40)
      const summary = writer.rich(next.summary, MAX.summary) ?? item.summary
      // a summary split into bullets: if none of them landed, the old summary still has the facts
      const split = !item.bullets.length && Boolean(next.bullets?.length)
      return {
        ...item,
        role: translate ? writer.plain(next.role, 240) ?? item.role : item.role,
        dates: translate ? writer.dates(next.dates, item.dates) : item.dates,
        summary: split && !bullets.length ? item.summary : summary,
        bullets: bullets.length ? bullets : item.bullets,
        tech: writer.rich(next.tech, MAX.tech) ?? item.tech,
        // a role that gained bullets is no longer a one-line entry
        compact: split && bullets.length ? false : item.compact,
      }
    })
    return { ...section, title, items }
  }
  if (section.type === "education") {
    const items = section.items.map((item) => {
      const next = byId.get(item.id)
      if (!next || !translate) return item
      return {
        ...item,
        degree: writer.plain(next.degree, 300) ?? item.degree,
        dates: writer.dates(next.dates, item.dates),
      }
    })
    return { ...section, title, items }
  }
  return section
}

export type Tailored = {
  content: CvContent
  notes: Pick<TailorNotes, "changes" | "gaps" | "unverified" | "reverted" | "keywords">
}

/**
 * The tailored CV, or null when the result is not a valid CV. `evidence` is everything the person
 * has said about themselves; `translateTo` is set when the CV changes language.
 */
export function applyTailoring(
  base: CvContent,
  reply: TailorReply,
  opts: { evidence: string; translateTo?: CvLocale | null }
): Tailored | null {
  const translate = Boolean(opts.translateTo)
  const writer = createWriter(base, opts.evidence)
  const headline = writer.plain(reply.headline, 300)

  const seen = new Set<string>()
  const sections: CvSection[] = []
  for (const proposal of reply.sections) {
    const section = base.sections.find((entry) => entry.id === proposal.id)
    if (!section || section.hidden || seen.has(section.id)) continue
    seen.add(section.id)
    sections.push(mergeSection(section, proposal, writer, translate))
  }
  // what the model did not mention stays, after what it ordered
  for (const section of base.sections) {
    if (!seen.has(section.id)) sections.push(section)
  }

  const content = parseCvContent({
    ...base,
    header: { ...base.header, headline: headline ?? base.header.headline },
    sections,
    consent:
      opts.translateTo && base.consent != null ? defaultConsent(opts.translateTo) : base.consent,
  })
  if (!content) return null
  const keywords = keywordNotes(reply.keywords, {
    before: cvPlainText(base),
    after: cvPlainText(content),
    evidence: opts.evidence,
  })
  // a keyword nothing backs comes first: the model said the person's data shows it
  const unverified = new Map(
    [
      ...keywords.unsupported,
      ...unverifiedTerms(writer.written, opts.evidence, { translated: translate }),
    ].map((term) => [term.toLowerCase(), term])
  )
  return {
    content,
    notes: {
      changes: reply.changes.map((line) => line.trim()).filter(Boolean),
      gaps: reply.gaps.map((line) => line.trim()).filter(Boolean),
      unverified: [...unverified.values()].slice(0, 12),
      reverted: writer.reverted(),
      keywords: keywords.keywords,
    },
  }
}

/* ---------------------------------------------------------------- one section */

/** Sections the model may rewrite on their own ("Popraw z AI"): not a letter, not education. */
export function isRewritable(section: CvSection): boolean {
  return (
    section.type === "text" ||
    section.type === "skills" ||
    section.type === "cards" ||
    section.type === "experience"
  )
}

export const SectionRewriteReply = z.object({
  section: ReplySection,
  changes: z.array(z.string().max(600)).max(10).catch([]),
})
export type SectionRewriteReply = z.infer<typeof SectionRewriteReply>

export type SectionRewrite = {
  section: CvSection
  /** Names in the new text that the person's data does not have */
  unverified: string[]
  /** Fields that kept their old text because the model added a number */
  reverted: number
}

/**
 * One section rewritten by the model, under the rules of tailoring: it stays where it is and
 * stays shown, every role keeps its company and dates, a field that gains a number nothing backs
 * keeps its old text, and no link is added. Null when the section is not there, may not be
 * rewritten, or the result is not a valid CV.
 */
export function applySectionRewrite(
  base: CvContent,
  proposal: SectionRewriteReply["section"],
  opts: { evidence: string }
): SectionRewrite | null {
  const section = base.sections.find((entry) => entry.id === proposal.id)
  if (!section || !isRewritable(section)) return null
  const writer = createWriter(base, opts.evidence)
  const merged = mergeSection(section, { ...proposal, hide: undefined }, writer, false)
  const content = parseCvContent({
    ...base,
    sections: base.sections.map((entry) => (entry.id === section.id ? merged : entry)),
  })
  const result = content?.sections.find((entry) => entry.id === section.id)
  if (!result) return null
  return {
    section: result,
    unverified: unverifiedTerms(writer.written, opts.evidence).slice(0, 12),
    reverted: writer.reverted(),
  }
}

/* ---------------------------------------------------------------- bullets */

/** One bullet of a role, rewritten: `index` counts the role's bullets from 0. */
export type BulletRewrite = { item: string; index: number; text: string }

export type BulletsApplied = {
  content: CvContent
  /** Bullets whose text changed */
  applied: number
  /** Rewrites refused because they added a number the person's data does not have */
  reverted: number
  /** Names in the new text that the person's data does not have */
  unverified: string[]
}

/**
 * Rewrites of single bullets (the bullet check after tailoring), under the rules of tailoring:
 * a rewrite that adds a number nothing backs, or runs past the limit, leaves its bullet as it was,
 * and no bullet is added, removed or moved. Null when the result is not a valid CV.
 */
export function applyBulletRewrites(
  base: CvContent,
  rewrites: BulletRewrite[],
  opts: { evidence: string }
): BulletsApplied | null {
  const writer = createWriter(base, opts.evidence)
  const wanted = new Map(rewrites.map((rewrite) => [`${rewrite.item}:${rewrite.index}`, rewrite]))
  let applied = 0
  const sections = base.sections.map((section) => {
    if (section.type !== "experience" || section.hidden) return section
    const items = section.items.map((item) => {
      const bullets = item.bullets.map((bullet, index) => {
        const rewrite = wanted.get(`${item.id}:${index}`)
        if (!rewrite) return bullet
        const next = writer.rich(rewrite.text, MAX.bullet)
        if (!next || inlineToText(next).trim() === inlineToText(bullet).trim()) return bullet
        applied += 1
        return next
      })
      return { ...item, bullets }
    })
    return { ...section, items }
  })
  const content = parseCvContent({ ...base, sections })
  if (!content) return null
  return {
    content,
    applied,
    reverted: writer.reverted(),
    unverified: unverifiedTerms(writer.written, opts.evidence).slice(0, 12),
  }
}
