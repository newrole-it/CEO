import { z } from "zod"
import {
  CV_LIMITS,
  CV_SECTION_TYPES,
  cvId,
  parseCvContent,
  type CvContent,
  type CvSection,
} from "./schema"
import { inlineToText } from "./sanitize"
import { createWriter, MAX, unverifiedTerms } from "./tailor"

/**
 * "Zbierz wszystko do CV ogólnego": the model merges what the person added in their other CVs
 * (./own-changes.ts) into the general CV, and this file decides what of its reply may land.
 * Unlike tailoring, nothing leaves the CV here: a section or an item the reply does not name
 * stays as it is, and what the reply adds goes after what is there. The number and link guards
 * are tailoring's (./tailor.ts createWriter).
 */

const GatherItem = z.object({
  /** Absent or unknown: a new item */
  id: z.string().max(40).optional(),
  company: z.string().optional(),
  role: z.string().optional(),
  dates: z.string().optional(),
  summary: z.string().optional(),
  bullets: z.array(z.string()).optional(),
  tech: z.string().optional(),
  label: z.string().optional(),
  text: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  school: z.string().optional(),
  degree: z.string().optional(),
})

const GatherSection = z.object({
  /** Absent: a new section, which needs a type and a title */
  id: z.string().max(40).optional(),
  type: z.enum(CV_SECTION_TYPES).optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  items: z.array(GatherItem).optional(),
})

export const GatherNote = z.object({
  /** The source CV's title, as it was given to the model */
  source: z.string().max(200),
  outcome: z.enum(["added", "merged", "skipped"]),
  text: z.string().max(600),
})

export const GatherReply = z.object({
  sections: z.array(GatherSection).max(CV_LIMITS.sections),
  notes: z.array(GatherNote).max(80).catch([]),
})

export type GatherReply = z.infer<typeof GatherReply>
export type GatherNote = z.infer<typeof GatherNote>
type ProposedSection = GatherReply["sections"][number]
type ProposedItem = z.infer<typeof GatherItem>

export type Gathered = {
  content: CvContent
  /** Fields that kept their old text because the new one added a number the CVs do not have */
  reverted: number
  /** Fields that kept their old text because the new one lost something the CV had */
  kept: number
  /** Names in the new text that the person's CVs do not have */
  unverified: string[]
}

/** How much shorter a merged text may be than the one it replaces: merging adds, it does not cut. */
const MIN_KEPT_LENGTH = 0.8

const textOf = (html: string) => inlineToText(html).replace(/\s+/g, " ").trim()
const numbersOf = (text: string) =>
  (text.match(/\d+(?:[.,]\d+)*/g) ?? []).map((value) => value.replace(/,/g, "."))

/** The model's reply read under tailoring's guards, and under one of its own: nothing the CV says is lost. */
function createGatherWriter(target: CvContent, evidence: string) {
  const writer = createWriter(target, evidence)
  let kept = 0

  /** Whether `next` still has every number of `old` and most of its length. */
  function holds(old: string, next: string): boolean {
    const before = textOf(old)
    const after = textOf(next)
    const numbers = new Set(numbersOf(after))
    return (
      after.length >= before.length * MIN_KEPT_LENGTH &&
      numbersOf(before).every((value) => numbers.has(value))
    )
  }

  /** Prose (a body, a summary, a role's bullets as one text): the new text, or the old one. */
  function prose(old: string, next: string | undefined, max: number): string {
    const written = writer.rich(next, max)
    if (written === undefined) return old
    if (holds(old, written)) return written
    kept += 1
    return old
  }

  /** A line that lists things (skills, technologies): every term it had must still be there. */
  function list(old: string, next: string | undefined, max: number): string {
    const written = writer.rich(next, max)
    if (written === undefined) return old
    const after = textOf(written).toLowerCase()
    const terms = textOf(old)
      .replace(/^[^:]{1,40}:\s*/, "")
      .split(/[,;·|]/)
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean)
    if (terms.every((term) => after.includes(term))) return written
    kept += 1
    return old
  }

  /** A role's bullets as proposed, or the old ones when one was refused or the list lost facts. */
  function bullets(old: string[], next: string[] | undefined): string[] {
    const proposed = (next ?? []).filter((bullet) => textOf(bullet))
    if (!proposed.length) return old
    const out = proposed.map((bullet) => writer.rich(bullet, MAX.bullet))
    // half a list loses facts: one refused bullet keeps the whole old list
    if (!out.every((bullet): bullet is string => Boolean(bullet))) return old
    if (holds(old.join(" "), out.join(" "))) return out
    kept += 1
    return old
  }

  return { ...writer, prose, list, bullets, kept: () => kept }
}

type Writer = ReturnType<typeof createGatherWriter>

function mergeItems(section: CvSection, proposals: ProposedItem[], writer: Writer): CvSection {
  const seen = new Set<string>()
  const byId = new Map<string, ProposedItem>()
  const fresh: ProposedItem[] = []
  const ids = new Set(
    section.type === "text" || section.type === "letter" ? [] : section.items.map((item) => item.id)
  )
  for (const proposal of proposals) {
    if (proposal.id && ids.has(proposal.id)) {
      if (!seen.has(proposal.id)) byId.set(proposal.id, proposal)
      seen.add(proposal.id)
    } else fresh.push(proposal)
  }
  const plain = (value: string | undefined, max: number) => writer.plain(value, max) ?? ""
  if (section.type === "experience") {
    const items = section.items.map((item) => {
      const next = byId.get(item.id)
      if (!next) return item
      return {
        ...item,
        summary: writer.prose(item.summary, next.summary, MAX.summary),
        bullets: writer.bullets(item.bullets, next.bullets),
        tech: writer.list(item.tech, next.tech, MAX.tech),
      }
    })
    for (const next of fresh) {
      const company = plain(next.company, 200)
      const role = plain(next.role, 240)
      if (!company && !role) continue
      items.push({
        id: cvId("i"),
        company,
        role,
        dates: plain(next.dates, 100),
        summary: writer.rich(next.summary, MAX.summary) ?? "",
        bullets: writer.bullets([], next.bullets),
        tech: writer.rich(next.tech, MAX.tech) ?? "",
        compact: false,
      })
    }
    return { ...section, items }
  }
  if (section.type === "skills") {
    const items = section.items.map((item) => {
      const next = byId.get(item.id)
      if (!next) return item
      return {
        ...item,
        label: writer.plain(next.label, 160) ?? item.label,
        text: writer.list(item.text, next.text, MAX.skill),
      }
    })
    for (const next of fresh) {
      const text = writer.rich(next.text, MAX.skill)
      if (text) items.push({ id: cvId("i"), label: plain(next.label, 160), text })
    }
    return { ...section, items }
  }
  if (section.type === "cards") {
    const items = section.items.map((item) => {
      const next = byId.get(item.id)
      return next ? { ...item, body: writer.prose(item.body, next.body, MAX.card) } : item
    })
    for (const next of fresh) {
      const title = plain(next.title, 240)
      if (title) {
        items.push({ id: cvId("i"), title, body: writer.rich(next.body, MAX.card) ?? "" })
      }
    }
    return { ...section, items }
  }
  if (section.type === "education") {
    const items = [...section.items]
    for (const next of fresh) {
      const school = plain(next.school, 240)
      if (!school) continue
      items.push({
        id: cvId("i"),
        school,
        degree: plain(next.degree, 300),
        dates: plain(next.dates, 100),
      })
    }
    return { ...section, items }
  }
  return section
}

function mergeSection(section: CvSection, proposal: ProposedSection, writer: Writer): CvSection {
  if (section.type === "text") {
    return { ...section, body: writer.prose(section.body, proposal.body, MAX.body) }
  }
  return mergeItems(section, proposal.items ?? [], writer)
}

function newSection(proposal: ProposedSection, writer: Writer): CvSection | null {
  const title = writer.plain(proposal.title, 120)
  if (!proposal.type || !title) return null
  const base = { id: cvId("s"), title }
  if (proposal.type === "text") {
    const body = writer.rich(proposal.body, MAX.body)
    return body ? { ...base, type: "text", body } : null
  }
  const empty = { ...base, type: proposal.type, items: [] } as CvSection
  const filled = mergeItems(empty, proposal.items ?? [], writer)
  return filled.type !== "text" && filled.type !== "letter" && filled.items.length ? filled : null
}

/** The general CV with the model's sections merged in; null when the result is not a valid CV. */
export function applyGather(
  target: CvContent,
  sections: GatherReply["sections"],
  opts: { evidence: string }
): Gathered | null {
  const writer = createGatherWriter(target, opts.evidence)
  const proposals = new Map<string, ProposedSection>()
  const added: CvSection[] = []
  for (const proposal of sections) {
    if (proposal.id) {
      if (!proposals.has(proposal.id)) proposals.set(proposal.id, proposal)
      continue
    }
    const section = newSection(proposal, writer)
    if (section) added.push(section)
  }
  const merged = target.sections.map((section) => {
    const proposal = proposals.get(section.id)
    // a hidden section is not shown to the model, so a reply naming one is not about its text
    if (!proposal || section.hidden || section.type === "letter") return section
    return mergeSection(section, proposal, writer)
  })
  const content = parseCvContent({ ...target, sections: [...merged, ...added] })
  if (!content) return null
  return {
    content,
    reverted: writer.reverted(),
    kept: writer.kept(),
    unverified: unverifiedTerms(writer.written, opts.evidence).slice(0, 12),
  }
}
