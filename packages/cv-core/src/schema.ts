import { z } from "zod"
import { sanitizeInline } from "./sanitize"

/**
 * A structured CV (CvDocument.content), version 1. The editor, the print view, the PDF and the
 * prompts all read this shape. Header fields are plain text; body fields (text, summary,
 * bullets, tech, skill text, card body) are the inline HTML subset from ./sanitize and are
 * sanitized whenever the schema parses them.
 */

export const CV_VERSION = 1
export const CV_ACCENT = "#175c72"
/** A photo is a data URL resized in the browser; ~1.5 MB of text is the hard cap. */
export const MAX_PHOTO_CHARS = 1_500_000

/** Plain one-line text: control characters become spaces. */
const plain = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => value.replace(/[\u0000-\u001f\u007f]+/g, " "))

const rich = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => sanitizeInline(value))

export const CvId = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[A-Za-z0-9_-]+$/)

export const CvLink = z.object({
  label: plain(160),
  url: z
    .string()
    .max(500)
    .refine(
      (value) => !value || /^(https?:\/\/|mailto:|tel:)/i.test(value.trim()),
      "http(s), mailto or tel only"
    ),
})

export const CvPhoto = z
  .string()
  .max(MAX_PHOTO_CHARS, "The photo is too large (max ~1.5 MB).")
  .regex(
    /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/,
    "The photo must be a JPEG, PNG or WebP data URL."
  )

export const CvHeader = z.object({
  name: plain(120),
  headline: plain(300),
  location: plain(160),
  email: plain(200),
  phone: plain(60),
  links: z.array(CvLink).max(8),
  photo: CvPhoto.nullable(),
})

const sectionBase = {
  id: CvId,
  title: plain(120),
  hidden: z.boolean().optional(),
}

export const CvSkillItem = z.object({ id: CvId, label: plain(160), text: rich(2000) })

export const CvExperienceItem = z.object({
  id: CvId,
  company: plain(200),
  role: plain(240),
  dates: plain(100),
  summary: rich(4000),
  bullets: z.array(rich(2000)).max(40),
  /** The "Technologie:" line, label included, e.g. "<strong>Technologie:</strong> Node.js" */
  tech: rich(2000),
  /** Older roles: tighter spacing after the entry */
  compact: z.boolean(),
})

export const CvCardItem = z.object({ id: CvId, title: plain(240), body: rich(4000) })

export const CvEducationItem = z.object({
  id: CvId,
  school: plain(240),
  degree: plain(300),
  dates: plain(100),
})

export const CvTextSection = z.object({
  ...sectionBase,
  type: z.literal("text"),
  body: rich(12000),
})
export const CvSkillsSection = z.object({
  ...sectionBase,
  type: z.literal("skills"),
  items: z.array(CvSkillItem).max(60),
})
export const CvExperienceSection = z.object({
  ...sectionBase,
  type: z.literal("experience"),
  items: z.array(CvExperienceItem).max(60),
})
export const CvCardsSection = z.object({
  ...sectionBase,
  type: z.literal("cards"),
  items: z.array(CvCardItem).max(30),
})
export const CvEducationSection = z.object({
  ...sectionBase,
  type: z.literal("education"),
  items: z.array(CvEducationItem).max(30),
})

/**
 * The one section of a cover letter. It has no heading on the sheet: `title` is the document's
 * name in the footer ("List motywacyjny"). Only the paragraphs are rich text.
 */
export const CvLetterSection = z.object({
  ...sectionBase,
  type: z.literal("letter"),
  date: plain(160),
  recipient: plain(400),
  subject: plain(300),
  greeting: plain(300),
  paragraphs: z.array(rich(4000)).max(20),
  closing: plain(200),
  signature: plain(200),
})

export const CvSection = z.discriminatedUnion("type", [
  CvTextSection,
  CvSkillsSection,
  CvExperienceSection,
  CvCardsSection,
  CvEducationSection,
  CvLetterSection,
])

export const CvContent = z.object({
  version: z.literal(CV_VERSION),
  header: CvHeader,
  sections: z.array(CvSection).max(40),
  /** GDPR consent in small print at the end; null hides it */
  consent: plain(3000).nullable(),
  theme: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
})

export type CvContent = z.infer<typeof CvContent>
export type CvHeader = z.infer<typeof CvHeader>
export type CvLink = z.infer<typeof CvLink>
export type CvSection = z.infer<typeof CvSection>
/** What can be added to a CV; a letter's section comes only with the letter. */
export type CvSectionType = Exclude<CvSection["type"], "letter">
export type CvLetterSection = z.infer<typeof CvLetterSection>
export type CvTextSection = z.infer<typeof CvTextSection>
export type CvSkillsSection = z.infer<typeof CvSkillsSection>
export type CvExperienceSection = z.infer<typeof CvExperienceSection>
export type CvCardsSection = z.infer<typeof CvCardsSection>
export type CvEducationSection = z.infer<typeof CvEducationSection>
export type CvSkillItem = z.infer<typeof CvSkillItem>
export type CvExperienceItem = z.infer<typeof CvExperienceItem>
export type CvCardItem = z.infer<typeof CvCardItem>
export type CvEducationItem = z.infer<typeof CvEducationItem>

export const CV_SECTION_TYPES = ["text", "skills", "experience", "cards", "education"] as const

/** The letter section of a cover letter; undefined for a CV. */
export function letterSection(content: CvContent): CvLetterSection | undefined {
  return content.sections.find((section): section is CvLetterSection => section.type === "letter")
}

/** Short random id for sections and items (stable across edits, unique within a CV). */
export function cvId(prefix = "b"): string {
  const random = Math.random().toString(36).slice(2, 10)
  const time = Date.now().toString(36).slice(-4)
  return `${prefix}${time}${random}`.slice(0, 40)
}

/** Validates (and sanitizes) unknown input; null when it is not a v1 CV. */
export function parseCvContent(value: unknown): CvContent | null {
  const parsed = CvContent.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** The character limit a too long field broke, for the editor's message. Null for other problems. */
export function cvTooLongLimit(value: unknown): number | null {
  const parsed = CvContent.safeParse(value)
  if (parsed.success) return null
  for (const issue of parsed.error.issues) {
    if (issue.code === "too_big" && issue.type === "string") return Number(issue.maximum)
  }
  return null
}

/** A readable one-line reason for a rejected CV, for API and MCP errors. */
export function cvContentError(value: unknown): string | null {
  const parsed = CvContent.safeParse(value)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  return issue ? `${issue.path.join(".") || "content"}: ${issue.message}` : "Invalid CV content."
}
