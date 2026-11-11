import { isBlankInline } from "./sanitize"
import { documentTemplate, sectionOnSide } from "./templates"
import {
  letterSection,
  type CvCardsSection,
  type CvColumns,
  type CvContent,
  type CvLetterSection,
  type CvSection,
  type CvSkillsSection,
} from "./schema"

/**
 * The CV as a flat sequence of atoms: the unit the paginator moves between pages. The editor
 * (React, @newrole/cv-editor) and the print HTML (@newrole/cv-engine/render) render the same atoms with the same
 * classes from ./styles, so a page break in the editor is a page break in the PDF.
 *
 * Vertical rhythm is the atom's `lead` (top padding, mm), never margins, so measured heights
 * are exact. The values reproduce the margins of the reference layout after collapsing.
 */

export type AtomKind =
  | "header"
  | "title"
  | "text"
  | "skills"
  | "job-head"
  | "job-summary"
  | "bullet"
  | "tech"
  | "cards"
  | "edu"
  | "empty"
  | "consent"
  | "letter-head"
  | "letter-subject"
  | "letter-greeting"
  | "letter-para"
  | "letter-closing"
  /** Two-column templates: the photo and the contact details, at the top of the side column */
  | "contact"

export type CvAtom = {
  /** Unique and stable across edits (React key, focus restore) */
  key: string
  kind: AtomKind
  sectionId?: string
  itemId?: string
  /** skills / cards rows: the items in this row (up to the section's columns) */
  itemIds?: string[]
  /** bullet index within the item */
  index?: number
  /** Space above, in mm (dropped when the atom starts a page) */
  lead: number
  keepWithNext: boolean
  /** Two-column templates: the atom flows in the side column, which breaks across pages alone */
  side?: boolean
}

export const LEAD = {
  title: 5.5,
  afterTitle: 3,
  skillRow: 1.5,
  cardRow: 7,
  edu: 2.5,
  jobAfterFull: 4.5,
  jobAfterCompact: 3.2,
  summary: 1,
  bulletAfterSummary: 2,
  bulletAfterHead: 1.5,
  bullet: 1,
  techAfterBullet: 1.5,
  techAfterSummary: 2,
  techAfterHead: 1.5,
  consent: 8,
  letterHead: 7,
  letterSubject: 7,
  letterGreeting: 6,
  letterPara: 3.5,
  letterClosing: 7,
} as const

export type FlowOptions = {
  /**
   * Editor mode: empty bullets, items and sections stay visible so they can be typed into.
   * Print mode (default) leaves out anything blank.
   */
  editing?: boolean
  /** Editor: optional fields (job summary / tech) kept although empty, e.g. while focused */
  keep?: ReadonlySet<string>
}

export function atomKey(...parts: (string | number)[]): string {
  return parts.join(":")
}

/** Items side by side in a skills or cards section: 2 unless the section says otherwise. */
export function sectionColumns(section: CvSkillsSection | CvCardsSection): CvColumns {
  return section.columns ?? 2
}

function rows<T>(items: T[], columns: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < items.length; i += columns) result.push(items.slice(i, i + columns))
  return result
}

/** A letter reads top to bottom with no heading; each paragraph can move to the next page alone. */
function letterAtoms(section: CvLetterSection, opts: FlowOptions): CvAtom[] {
  const editing = Boolean(opts.editing)
  const sid = section.id
  const atoms: CvAtom[] = []
  const add = (part: string, kind: AtomKind, lead: number, keepWithNext = false, index?: number) =>
    atoms.push({ key: atomKey(sid, part), kind, sectionId: sid, index, lead, keepWithNext })

  if (editing || section.date.trim() || section.recipient.trim())
    add("head", "letter-head", LEAD.letterHead)
  if (editing || section.subject.trim()) add("subject", "letter-subject", LEAD.letterSubject, true)
  if (editing || section.greeting.trim())
    add("greeting", "letter-greeting", LEAD.letterGreeting, true)
  section.paragraphs.forEach((paragraph, index) => {
    if (editing || !isBlankInline(paragraph))
      add(`para:${index}`, "letter-para", LEAD.letterPara, false, index)
  })
  if (editing && !section.paragraphs.length) add("empty", "empty", LEAD.letterPara)
  if (editing || section.closing.trim() || section.signature.trim())
    add("closing", "letter-closing", LEAD.letterClosing)
  return atoms
}

function sectionAtoms(section: CvSection, opts: FlowOptions): CvAtom[] {
  if (section.type === "letter") return letterAtoms(section, opts)
  const editing = Boolean(opts.editing)
  const keep = opts.keep
  const sid = section.id
  const body: CvAtom[] = []

  if (section.type === "text") {
    if (editing || !isBlankInline(section.body)) {
      body.push({
        key: atomKey(sid, "text"),
        kind: "text",
        sectionId: sid,
        lead: LEAD.afterTitle,
        keepWithNext: false,
      })
    }
  } else if (section.type === "skills") {
    const items = editing
      ? section.items
      : section.items.filter((item) => item.label.trim() || !isBlankInline(item.text))
    rows(items, sectionColumns(section)).forEach((row, index) => {
      body.push({
        key: atomKey(sid, "row", row[0].id),
        kind: "skills",
        sectionId: sid,
        itemIds: row.map((item) => item.id),
        lead: index === 0 ? LEAD.afterTitle : LEAD.skillRow,
        keepWithNext: false,
      })
    })
  } else if (section.type === "cards") {
    const items = editing
      ? section.items
      : section.items.filter((item) => item.title.trim() || !isBlankInline(item.body))
    rows(items, sectionColumns(section)).forEach((row, index) => {
      body.push({
        key: atomKey(sid, "row", row[0].id),
        kind: "cards",
        sectionId: sid,
        itemIds: row.map((item) => item.id),
        lead: index === 0 ? LEAD.afterTitle : LEAD.cardRow,
        keepWithNext: false,
      })
    })
  } else if (section.type === "education") {
    const items = editing
      ? section.items
      : section.items.filter(
          (item) => item.school.trim() || item.degree.trim() || item.dates.trim()
        )
    items.forEach((item, index) => {
      body.push({
        key: atomKey(sid, item.id),
        kind: "edu",
        sectionId: sid,
        itemId: item.id,
        lead: index === 0 ? LEAD.afterTitle : LEAD.edu,
        keepWithNext: false,
      })
    })
  } else if (section.type === "experience") {
    let previousCompact: boolean | null = null
    for (const item of section.items) {
      const iid = item.id
      const bullets = item.bullets
        .map((text, index) => ({ text, index }))
        .filter((bullet) => editing || !isBlankInline(bullet.text))
      const summaryKey = atomKey(sid, iid, "summary")
      const techKey = atomKey(sid, iid, "tech")
      const hasSummary = !isBlankInline(item.summary) || Boolean(editing && keep?.has(summaryKey))
      const hasTech = !isBlankInline(item.tech) || Boolean(editing && keep?.has(techKey))
      const headVisible = item.company.trim() || item.role.trim() || item.dates.trim()
      if (!editing && !headVisible && !hasSummary && !bullets.length && !hasTech) continue
      const entry: CvAtom[] = []
      entry.push({
        key: atomKey(sid, iid, "head"),
        kind: "job-head",
        sectionId: sid,
        itemId: iid,
        lead:
          previousCompact === null
            ? LEAD.afterTitle
            : previousCompact
              ? LEAD.jobAfterCompact
              : LEAD.jobAfterFull,
        keepWithNext: true,
      })
      if (hasSummary) {
        entry.push({
          key: summaryKey,
          kind: "job-summary",
          sectionId: sid,
          itemId: iid,
          lead: LEAD.summary,
          keepWithNext: false,
        })
      }
      bullets.forEach((bullet, position) => {
        entry.push({
          key: atomKey(sid, iid, "bullet", bullet.index),
          kind: "bullet",
          sectionId: sid,
          itemId: iid,
          index: bullet.index,
          lead:
            position > 0
              ? LEAD.bullet
              : hasSummary
                ? LEAD.bulletAfterSummary
                : LEAD.bulletAfterHead,
          keepWithNext: false,
        })
      })
      if (hasTech) {
        const last = entry[entry.length - 1]
        const lead =
          last.kind === "bullet"
            ? LEAD.techAfterBullet
            : last.kind === "job-summary"
              ? LEAD.techAfterSummary
              : LEAD.techAfterHead
        // the tech line never starts a page alone
        last.keepWithNext = true
        entry.push({
          key: techKey,
          kind: "tech",
          sectionId: sid,
          itemId: iid,
          lead,
          keepWithNext: false,
        })
      }
      body.push(...entry)
      previousCompact = item.compact
    }
  }

  if (!body.length) {
    if (!editing) return []
    body.push({
      key: atomKey(sid, "empty"),
      kind: "empty",
      sectionId: sid,
      lead: LEAD.afterTitle,
      keepWithNext: false,
    })
  }
  return [
    {
      key: atomKey(sid, "title"),
      kind: "title",
      sectionId: sid,
      lead: LEAD.title,
      keepWithNext: true,
    },
    ...body,
  ]
}

/**
 * The atoms of a CV in reading order. Hidden sections are left out. In a two-column template the
 * contact atom and the atoms of the sections on the side carry `side`; each column keeps its order.
 */
export function cvFlow(content: CvContent, opts: FlowOptions = {}): CvAtom[] {
  const columns = Boolean(documentTemplate(content).columns)
  const atoms: CvAtom[] = [{ key: "header", kind: "header", lead: 0, keepWithNext: false }]
  if (columns)
    atoms.push({ key: "contact", kind: "contact", lead: 0, keepWithNext: false, side: true })
  for (const section of content.sections) {
    if (section.hidden) continue
    const side = columns && sectionOnSide(section)
    const own = sectionAtoms(section, opts)
    atoms.push(...(side ? own.map((atom) => ({ ...atom, side: true })) : own))
  }
  if (content.consent != null && (opts.editing || content.consent.trim())) {
    atoms.push({ key: "consent", kind: "consent", lead: LEAD.consent, keepWithNext: false })
  }
  return atoms
}

/** What the document calls itself: "CV", or the letter's own name. */
export function documentLabel(content: CvContent): string {
  return letterSection(content)?.title.trim() || "CV"
}

/** "Rafał Testowy · CV · 2/3" */
export function footerText(content: CvContent, page: number, count: number): string {
  const name = content.header.name.trim()
  return `${name ? `${name} · ` : ""}${documentLabel(content)} · ${page}/${count}`
}

/** Contact line pieces in header order: location, email, phone (line 1), then links (line 2). */
export function contactLines(content: CvContent): {
  first: { kind: "location" | "email" | "phone"; text: string; href: string | null }[]
  links: { label: string; url: string }[]
} {
  const header = content.header
  const first: { kind: "location" | "email" | "phone"; text: string; href: string | null }[] = []
  if (header.location.trim()) first.push({ kind: "location", text: header.location, href: null })
  if (header.email.trim())
    first.push({ kind: "email", text: header.email, href: `mailto:${header.email.trim()}` })
  if (header.phone.trim()) {
    first.push({
      kind: "phone",
      text: header.phone,
      href: `tel:${header.phone.replace(/[^\d+]/g, "")}`,
    })
  }
  const links = header.links.filter((link) => link.label.trim() || link.url.trim())
  return { first, links }
}
