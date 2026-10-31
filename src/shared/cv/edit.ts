import type { CvContent, CvExperienceItem, CvHeader, CvSection } from "./schema"

/**
 * Pure edits for the CV editor. Each returns a new CvContent that shares unchanged parts with
 * the old one, so undo snapshots stay cheap. Unknown ids return the content unchanged.
 */

export type MoveDirection = -1 | 1

function moved<T>(list: T[], index: number, direction: MoveDirection): T[] {
  const target = index + direction
  if (index < 0 || target < 0 || target >= list.length) return list
  const next = [...list]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function updateHeader(content: CvContent, patch: Partial<CvHeader>): CvContent {
  return { ...content, header: { ...content.header, ...patch } }
}

export function updateSection(
  content: CvContent,
  id: string,
  patch: Record<string, unknown>
): CvContent {
  return {
    ...content,
    sections: content.sections.map((section) =>
      section.id === id ? ({ ...section, ...patch } as CvSection) : section
    ),
  }
}

export function moveSection(content: CvContent, id: string, direction: MoveDirection): CvContent {
  const index = content.sections.findIndex((section) => section.id === id)
  return { ...content, sections: moved(content.sections, index, direction) }
}

export function removeSection(content: CvContent, id: string): CvContent {
  return { ...content, sections: content.sections.filter((section) => section.id !== id) }
}

/** Adds a section after `afterId`, or at the end when it is null or unknown. */
export function insertSection(
  content: CvContent,
  section: CvSection,
  afterId: string | null = null
): CvContent {
  const at = afterId ? content.sections.findIndex((entry) => entry.id === afterId) : -1
  const sections = [...content.sections]
  if (at >= 0) sections.splice(at + 1, 0, section)
  else sections.push(section)
  return { ...content, sections }
}

function withItems(
  content: CvContent,
  sectionId: string,
  change: (items: { id: string }[]) => { id: string }[]
): CvContent {
  return {
    ...content,
    sections: content.sections.map((section) => {
      if (section.id !== sectionId || section.type === "text" || section.type === "letter")
        return section
      return { ...section, items: change(section.items) } as CvSection
    }),
  }
}

export function updateItem(
  content: CvContent,
  sectionId: string,
  itemId: string,
  patch: Record<string, unknown>
): CvContent {
  return withItems(content, sectionId, (items) =>
    items.map((item) => (item.id === itemId ? { ...item, ...patch } : item))
  )
}

export function moveItem(
  content: CvContent,
  sectionId: string,
  itemId: string,
  direction: MoveDirection
): CvContent {
  return withItems(content, sectionId, (items) =>
    moved(
      items,
      items.findIndex((item) => item.id === itemId),
      direction
    )
  )
}

export function removeItem(content: CvContent, sectionId: string, itemId: string): CvContent {
  return withItems(content, sectionId, (items) => items.filter((item) => item.id !== itemId))
}

/** Adds an item after `afterId`, or at the end when it is null or unknown. */
export function insertItem(
  content: CvContent,
  sectionId: string,
  item: { id: string },
  afterId: string | null = null
): CvContent {
  return withItems(content, sectionId, (items) => {
    const at = afterId ? items.findIndex((entry) => entry.id === afterId) : -1
    const next = [...items]
    if (at >= 0) next.splice(at + 1, 0, item)
    else next.push(item)
    return next
  })
}

function withBullets(
  content: CvContent,
  sectionId: string,
  itemId: string,
  change: (bullets: string[]) => string[]
): CvContent {
  return withItems(content, sectionId, (items) =>
    items.map((item) => {
      if (item.id !== itemId) return item
      const job = item as CvExperienceItem
      return { ...job, bullets: change(job.bullets) }
    })
  )
}

export function updateBullet(
  content: CvContent,
  sectionId: string,
  itemId: string,
  index: number,
  html: string
): CvContent {
  return withBullets(content, sectionId, itemId, (bullets) =>
    bullets.map((bullet, at) => (at === index ? html : bullet))
  )
}

/** Inserts a bullet after `afterIndex` (-1 puts it first). */
export function insertBullet(
  content: CvContent,
  sectionId: string,
  itemId: string,
  afterIndex: number,
  html = ""
): CvContent {
  return withBullets(content, sectionId, itemId, (bullets) => {
    const next = [...bullets]
    next.splice(afterIndex + 1, 0, html)
    return next
  })
}

export function removeBullet(
  content: CvContent,
  sectionId: string,
  itemId: string,
  index: number
): CvContent {
  return withBullets(content, sectionId, itemId, (bullets) =>
    bullets.filter((_, at) => at !== index)
  )
}

export function moveBullet(
  content: CvContent,
  sectionId: string,
  itemId: string,
  index: number,
  direction: MoveDirection
): CvContent {
  return withBullets(content, sectionId, itemId, (bullets) => moved(bullets, index, direction))
}

function withParagraphs(
  content: CvContent,
  sectionId: string,
  change: (paragraphs: string[]) => string[]
): CvContent {
  return {
    ...content,
    sections: content.sections.map((section) =>
      section.id === sectionId && section.type === "letter"
        ? { ...section, paragraphs: change(section.paragraphs) }
        : section
    ),
  }
}

export function updateParagraph(
  content: CvContent,
  sectionId: string,
  index: number,
  html: string
): CvContent {
  return withParagraphs(content, sectionId, (paragraphs) =>
    paragraphs.map((paragraph, at) => (at === index ? html : paragraph))
  )
}

/** Inserts a paragraph after `afterIndex` (-1 puts it first). */
export function insertParagraph(
  content: CvContent,
  sectionId: string,
  afterIndex: number,
  html = ""
): CvContent {
  return withParagraphs(content, sectionId, (paragraphs) => {
    const next = [...paragraphs]
    next.splice(afterIndex + 1, 0, html)
    return next
  })
}

export function removeParagraph(content: CvContent, sectionId: string, index: number): CvContent {
  return withParagraphs(content, sectionId, (paragraphs) =>
    paragraphs.filter((_, at) => at !== index)
  )
}

export function moveParagraph(
  content: CvContent,
  sectionId: string,
  index: number,
  direction: MoveDirection
): CvContent {
  return withParagraphs(content, sectionId, (paragraphs) => moved(paragraphs, index, direction))
}
