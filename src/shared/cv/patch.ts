import type { CvContent, CvSection } from "./schema"

/**
 * A targeted change to one section or item, used by the MCP tool cv_update. It only merges; the
 * caller validates the result against the schema. Throws a plain Error naming what is missing.
 */
export type CvPatch = {
  /** Merges into the section with this id; a new id with a `type` appends a new section */
  section?: { id: string } & Record<string, unknown>
  /** Merges into the item with this id; a new id appends a new item to the section */
  item?: { sectionId: string; id: string } & Record<string, unknown>
  /** Removes a section, or one item when itemId is given */
  remove?: { sectionId: string; itemId?: string }
}

export function applyCvPatch(content: CvContent, patch: CvPatch): CvContent {
  let sections: CvSection[] = content.sections

  if (patch.section) {
    const { id, ...fields } = patch.section
    const at = sections.findIndex((section) => section.id === id)
    if (at >= 0) {
      if (fields.type !== undefined && fields.type !== sections[at].type) {
        throw new Error(`Section ${id} is of type ${sections[at].type}; it cannot change type.`)
      }
      sections = sections.map((section, index) =>
        index === at ? ({ ...section, ...fields } as CvSection) : section
      )
    } else if (fields.type) {
      sections = [...sections, { id, ...fields } as unknown as CvSection]
    } else {
      throw new Error(`No section with id ${id}. Pass a type to add a new one.`)
    }
  }

  if (patch.item) {
    const { sectionId, id, ...fields } = patch.item
    const at = sections.findIndex((section) => section.id === sectionId)
    if (at < 0) throw new Error(`No section with id ${sectionId}.`)
    const section = sections[at]
    if (section.type === "text")
      throw new Error(`Section ${sectionId} is plain text; change its body with section.`)
    const items = section.items as { id: string }[]
    const next = items.some((item) => item.id === id)
      ? items.map((item) => (item.id === id ? { ...item, ...fields } : item))
      : [...items, { id, ...fields }]
    sections = sections.map((entry, index) =>
      index === at ? ({ ...entry, items: next } as CvSection) : entry
    )
  }

  if (patch.remove) {
    const { sectionId, itemId } = patch.remove
    const section = sections.find((entry) => entry.id === sectionId)
    if (!section) throw new Error(`No section with id ${sectionId}.`)
    if (!itemId) {
      sections = sections.filter((entry) => entry.id !== sectionId)
    } else {
      if (section.type === "text") throw new Error(`Section ${sectionId} has no items.`)
      const items = section.items as { id: string }[]
      if (!items.some((item) => item.id === itemId))
        throw new Error(`No item ${itemId} in section ${sectionId}.`)
      sections = sections.map((entry) =>
        entry.id === sectionId
          ? ({ ...entry, items: items.filter((item) => item.id !== itemId) } as CvSection)
          : entry
      )
    }
  }

  return { ...content, sections }
}
