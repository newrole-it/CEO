import { inlineToText } from "./sanitize"
import type {
  CvCardItem,
  CvContent,
  CvEducationItem,
  CvExperienceItem,
  CvSection,
  CvSkillItem,
} from "./schema"

/**
 * What one CV holds that another does not: the person's own additions and rewordings, for
 * gathering them into the general CV (./gather.ts). `reference` is what the CV was before the
 * person worked on it: for a CV written for an offer, the version the model generated. Only what
 * was added or reworded counts. Something cut for one offer says nothing about the general CV,
 * and the header, photo, theme, consent and what is shown or hidden are per document.
 */

type Where = { id: string; type: CvSection["type"]; title: string }
/** A role is "company · role", a skill its label, a card its title, a school "school · degree". */
type Item = { id: string; label: string }
type AnyItem = CvExperienceItem | CvSkillItem | CvCardItem | CvEducationItem

export type OwnChange =
  | {
      kind: "field"
      section: Where
      item: Item | null
      field: "body" | "summary" | "tech" | "label" | "text" | "title"
      before: string
      after: string
    }
  | { kind: "bullets"; section: Where; item: Item; added: string[] }
  | { kind: "item"; section: Where; item: AnyItem }
  | { kind: "section"; section: CvSection }

/** Plain text, case and whitespace folded: a change of formatting alone is no change. */
const fold = (html: string) => inlineToText(html).replace(/\s+/g, " ").trim().toLowerCase()

const joined = (...parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" · ")

function labelOf(item: AnyItem): string {
  if ("company" in item) return joined(item.company, item.role)
  if ("school" in item) return joined(item.school, item.degree)
  if ("label" in item) return item.label.trim()
  return item.title.trim()
}

/**
 * Which entry of `others` each entry is: by id, else by name. An entry of `others` is taken once,
 * so a second stint at the same company and role is a new role, not the old one again.
 */
function pair<T extends { id: string }>(
  entries: T[],
  others: T[],
  name: (value: T) => string
): Map<T, T> {
  const pairs = new Map<T, T>()
  const taken = new Set<T>()
  for (const entry of entries) {
    const other = others.find((candidate) => candidate.id === entry.id && !taken.has(candidate))
    if (!other) continue
    pairs.set(entry, other)
    taken.add(other)
  }
  for (const entry of entries) {
    if (pairs.has(entry) || !fold(name(entry))) continue
    const other = others.find(
      (candidate) => !taken.has(candidate) && fold(name(candidate)) === fold(name(entry))
    )
    if (!other) continue
    pairs.set(entry, other)
    taken.add(other)
  }
  return pairs
}

const sectionName = (section: CvSection) => `${section.type}\n${section.title}`

export function ownChanges(now: CvContent, reference: CvContent): OwnChange[] {
  const changes: OwnChange[] = []
  const shown = now.sections.filter((section) => !section.hidden && section.type !== "letter")
  const sections = pair(shown, reference.sections, sectionName)
  for (const section of shown) {
    const before = sections.get(section)
    if (!before || before.type !== section.type) {
      changes.push({ kind: "section", section })
      continue
    }
    const where: Where = { id: section.id, type: section.type, title: section.title }
    const field = (
      item: Item | null,
      name: Extract<OwnChange, { kind: "field" }>["field"],
      was: string,
      is: string
    ) => {
      if (fold(was) === fold(is) || !fold(is)) return
      changes.push({ kind: "field", section: where, item, field: name, before: was, after: is })
    }
    if (section.type === "text") {
      if (before.type === "text") field(null, "body", before.body, section.body)
      continue
    }
    if (before.type === "text" || before.type === "letter" || section.type === "letter") continue
    const items = pair(section.items as AnyItem[], before.items as AnyItem[], labelOf)
    for (const entry of section.items as AnyItem[]) {
      const old = items.get(entry)
      if (!old) {
        changes.push({ kind: "item", section: where, item: entry })
        continue
      }
      const item: Item = { id: entry.id, label: labelOf(entry) }
      if ("company" in entry && "company" in old) {
        field(item, "summary", old.summary, entry.summary)
        const known = new Set(old.bullets.map(fold))
        const added = entry.bullets.filter((bullet) => fold(bullet) && !known.has(fold(bullet)))
        if (added.length) changes.push({ kind: "bullets", section: where, item, added })
        field(item, "tech", old.tech, entry.tech)
      } else if ("label" in entry && "label" in old) {
        field(item, "label", old.label, entry.label)
        field(item, "text", old.text, entry.text)
      } else if ("body" in entry && "body" in old) {
        field(item, "title", old.title, entry.title)
        field(item, "body", old.body, entry.body)
      }
    }
  }
  return changes
}

/** Characters of the changes as the model will read them. */
export function changesSize(changes: OwnChange[]): number {
  return JSON.stringify(changes).length
}

/**
 * The changes that `content` still holds: an added line the person took out again, or one a later
 * rewrite replaced, is no longer theirs to carry over. Compared as plain text, like ownChanges.
 */
export function keepPresent(changes: OwnChange[], content: CvContent): OwnChange[] {
  const shown = content.sections.filter((section) => !section.hidden && section.type !== "letter")
  const texts: string[] = []
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const section of shown) {
    ids.add(section.id)
    names.add(fold(sectionName(section)))
    if (section.type === "text") texts.push(section.body)
    if (section.type === "text" || section.type === "letter") continue
    for (const item of section.items as AnyItem[]) {
      ids.add(`${section.id}/${item.id}`)
      names.add(fold(`${section.type}\n${labelOf(item)}`))
      if ("company" in item) texts.push(item.summary, ...item.bullets, item.tech)
      else if ("label" in item) texts.push(item.label, item.text)
      else if ("body" in item) texts.push(item.title, item.body)
    }
  }
  const all = texts.map(fold).join("\n")
  const has = (text: string) => Boolean(fold(text)) && all.includes(fold(text))
  return changes.flatMap((change): OwnChange[] => {
    if (change.kind === "field") return has(change.after) ? [change] : []
    if (change.kind === "bullets") {
      const added = change.added.filter(has)
      return added.length ? [{ ...change, added }] : []
    }
    if (change.kind === "item") {
      const there =
        ids.has(`${change.section.id}/${change.item.id}`) ||
        names.has(fold(`${change.section.type}\n${labelOf(change.item)}`))
      return there ? [change] : []
    }
    const there = ids.has(change.section.id) || names.has(fold(sectionName(change.section)))
    return there ? [change] : []
  })
}
