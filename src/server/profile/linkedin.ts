import { createHash } from "crypto"
import { z } from "zod"
import { fold } from "matching/text"
import { visibleText } from "./industry"

export const blockKinds = ["headline", "about", "experience", "education", "skills"] as const
export type BlockKind = (typeof blockKinds)[number]

export const partFields = ["title", "subtitle", "body"] as const
export type PartField = (typeof partFields)[number]

const partSchema = z.object({
  field: z.enum(partFields),
  text: z.string().min(1).max(4000),
})

const blockSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(blockKinds),
  label: z.string().min(1).max(40),
  parts: z.array(partSchema).min(1).max(4),
})

export const linkedInDocumentSchema = z.object({
  name: z.string().max(120).nullable(),
  location: z.string().max(120).nullable(),
  blocks: z.array(blockSchema).min(1).max(30),
})

export type ProfilePart = z.infer<typeof partSchema>
export type ProfileBlock = z.infer<typeof blockSchema>
export type LinkedInDocument = z.infer<typeof linkedInDocumentSchema>

const LABELS: Record<BlockKind, string> = {
  headline: "Headline",
  about: "About",
  experience: "Experience",
  education: "Education",
  skills: "Skills",
}

function clip(value: string, max: number): string {
  const trimmed = value.replace(/\s+\n/g, "\n").trim()
  return trimmed.length > max ? trimmed.slice(0, max).trim() : trimmed
}

function headingKind(line: string): BlockKind | "skip" | null {
  const key = fold(line).replace(/:$/, "").trim()
  if (/^(summary|about|about me|o mnie|podsumowanie)$/.test(key)) return "about"
  if (/^(experience|work experience|doswiadczenie)$/.test(key)) return "experience"
  if (/^(education|wyksztalcenie)$/.test(key)) return "education"
  if (/^(skills|top skills|umiejetnosci)$/.test(key)) return "skills"
  if (/^(languages|jezyki|certifications|licenses|honors|publications|interests)$/.test(key)) {
    return "skip"
  }
  return null
}

function isDateLine(line: string): boolean {
  if (line.length > 90) return false
  const years = line.match(/\b(?:19|20)\d{2}\b/g) ?? []
  if (/present|current|obecnie/i.test(line) && years.length >= 1) return true
  return years.length >= 2
}

function isLocation(line: string): boolean {
  const folded = fold(line)
  return (
    /,/.test(line) ||
    /\b(poland|polska|warsaw|warszawa|remote|krakow|wroclaw|gdansk|poznan|europe)\b/.test(folded)
  )
}

function isContact(line: string): boolean {
  return /@|linkedin\.com|https?:|\+\d{6,}|\b(phone|mobile|tel)\b/i.test(line)
}

function entriesFromLines(lines: string[]): string[][] {
  const dates = lines
    .map((line, index) => (isDateLine(line) ? index : -1))
    .filter((index) => index >= 0)
  if (!dates.length) return lines.length ? [lines] : []
  return dates
    .map((dateAt, index) => {
      const prevDate = index === 0 ? -1 : dates[index - 1]
      const nextDate = index + 1 < dates.length ? dates[index + 1] : lines.length
      const start = Math.max(prevDate + 1, dateAt - 2)
      const end = index + 1 < dates.length ? Math.max(dateAt + 1, nextDate - 2) : lines.length
      return lines.slice(start, end)
    })
    .filter((chunk) => chunk.length > 0)
}

function entryParts(lines: string[]): ProfilePart[] {
  const dateAt = lines.findIndex((line) => isDateLine(line))
  let title = ""
  let organization = ""
  let meta = ""
  let body = ""
  if (dateAt < 0) {
    title = lines[0] ?? ""
    organization = lines[1] ?? ""
    body = lines.slice(2).join("\n")
  } else {
    const before = lines.slice(0, dateAt)
    if (before.length >= 2) {
      organization = before[0]
      title = before[before.length - 1]
    } else {
      title = before[0] ?? ""
    }
    const after = lines.slice(dateAt + 1)
    meta = lines[dateAt]
    let bodyStart = 0
    const maybePlace = after[0]
    if (
      maybePlace &&
      maybePlace.length < 60 &&
      !/[.!?]$/.test(maybePlace) &&
      maybePlace.split(/\s+/).length <= 6
    ) {
      meta = `${meta} · ${maybePlace}`
      bodyStart = 1
    }
    body = after.slice(bodyStart).join("\n")
  }
  const subtitle = [organization, meta].filter(Boolean).join(" · ")
  const parts: ProfilePart[] = []
  if (title.trim()) parts.push({ field: "title", text: clip(title, 200) })
  if (subtitle.trim()) parts.push({ field: "subtitle", text: clip(subtitle, 200) })
  if (body.trim()) parts.push({ field: "body", text: clip(body, 4000) })
  return parts
}

function skillText(lines: string[]): string {
  const tokens = lines
    .flatMap((line) => line.split(/[·•|,]/))
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter((item) => item.length > 1 && !headingKind(item))
  const unique: string[] = []
  for (const token of tokens) {
    const key = fold(token)
    if (unique.some((item) => fold(item) === key)) continue
    unique.push(clip(token, 60))
    if (unique.length >= 40) break
  }
  return unique.join(" · ")
}

function block(id: string, kind: BlockKind, parts: ProfilePart[]): ProfileBlock | null {
  const kept = parts.filter((part) => part.text.trim())
  if (!kept.length) return null
  return { id, kind, label: LABELS[kind], parts: kept }
}

type Section = { kind: BlockKind | "skip"; lines: string[] }

function sectionsOf(lines: string[]): { preamble: string[]; sections: Section[] } {
  const preamble: string[] = []
  const sections: Section[] = []
  let current: Section | null = null
  for (const line of lines) {
    const kind = headingKind(line)
    if (kind) {
      current = { kind, lines: [] }
      sections.push(current)
      continue
    }
    if (current) current.lines.push(line)
    else preamble.push(line)
  }
  return { preamble, sections }
}

function preambleIdentity(lines: string[]): {
  name: string | null
  headline: string | null
  location: string | null
  rest: string[]
} {
  const kept = lines.filter((line) => !/^contact$|^kontakt$/i.test(line) && !isContact(line))
  if (!kept.length) return { name: null, headline: null, location: null, rest: [] }
  if (kept.length === 1) return { name: null, headline: kept[0], location: null, rest: [] }
  const location = kept.slice(2).find((line) => isLocation(line)) ?? null
  const rest = kept.slice(2).filter((line) => line !== location)
  return { name: kept[0], headline: kept[1], location, rest }
}

export function profileText(document: LinkedInDocument): string {
  return [
    document.name,
    document.location,
    ...document.blocks.flatMap((item) => item.parts.map((part) => part.text)),
  ]
    .filter(Boolean)
    .join("\n")
}

export function documentHash(document: LinkedInDocument): string {
  return createHash("sha256").update(JSON.stringify(document)).digest("hex")
}

export function parseStoredDocument(value: unknown): LinkedInDocument | null {
  const parsed = linkedInDocumentSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function parseLinkedInProfile(raw: string): LinkedInDocument | null {
  const source = visibleText(raw).replace(/\r/g, "")
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) return null
  const { preamble, sections } = sectionsOf(lines)
  const identity = preambleIdentity(preamble)
  const blocks: ProfileBlock[] = []
  if (identity.headline) {
    const headline = block("headline", "headline", [
      { field: "body", text: clip(identity.headline, 220) },
    ])
    if (headline) blocks.push(headline)
  }

  const content = sections.filter((section) => section.kind !== "skip")
  if (!content.length && identity.rest.length) {
    const skillsLine = identity.rest.find((line) => /^skills?\s*[:\-]/i.test(line))
    const aboutLines = identity.rest.filter((line) => line !== skillsLine)
    const about = block("about", "about", [
      { field: "body", text: clip(aboutLines.join("\n"), 4000) },
    ])
    if (about) blocks.push(about)
    if (skillsLine) {
      const skills = block("skills", "skills", [
        { field: "body", text: skillText([skillsLine.replace(/^skills?\s*[:\-]\s*/i, "")]) },
      ])
      if (skills) blocks.push(skills)
    }
  }

  let experienceCount = 0
  let educationCount = 0
  for (const section of content) {
    if (section.kind === "about") {
      const about = block("about", "about", [
        { field: "body", text: clip(section.lines.join("\n"), 4000) },
      ])
      if (about) blocks.push(about)
    } else if (section.kind === "skills") {
      const text = skillText(section.lines)
      const skills = block("skills", "skills", text ? [{ field: "body", text }] : [])
      if (skills) blocks.push(skills)
    } else if (section.kind === "experience" || section.kind === "education") {
      for (const entry of entriesFromLines(section.lines)) {
        const parts = entryParts(entry)
        if (section.kind === "experience") {
          experienceCount += 1
          const item = block(`experience-${experienceCount}`, "experience", parts)
          if (item) blocks.push(item)
        } else {
          educationCount += 1
          const item = block(`education-${educationCount}`, "education", parts)
          if (item) blocks.push(item)
        }
      }
    }
  }

  if (!blocks.length) {
    const fallback = block("about", "about", [
      { field: "body", text: clip(lines.join("\n"), 4000) },
    ])
    if (fallback) blocks.push(fallback)
  }

  const document = {
    name: identity.name ? clip(identity.name, 120) : null,
    location: identity.location ? clip(identity.location, 120) : null,
    blocks: blocks.slice(0, 30),
  }
  const parsed = linkedInDocumentSchema.safeParse(document)
  return parsed.success ? parsed.data : null
}
