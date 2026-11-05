import { z } from "zod"
import {
  builtAuditSchema,
  categoryLabel,
  progressCopy,
  type AuditCategory,
  type AuditLocale,
  type BuiltAudit,
} from "./audit"
import { phraseLabel } from "./demand"
import {
  parseLinkedInProfile,
  type BlockKind,
  type LinkedInDocument,
  type PartField,
} from "./linkedin"
import { linkedInLayout, sectionsFromUnknown } from "./linkedin-layout"

/**
 * The profile as the Chrome extension reads it from the person's own LinkedIn page. The sections
 * become the text layout of the PDF import, so one parser and one audit serve both. What the
 * extension shows of an audit is auditView; keeping the runs is the app's (newrole.it:
 * src/server/profile/linkedin-audit.ts).
 */

const MAX_ITEMS = 30

/** Over the cap the text is cut, not refused: one long description must not fail the audit. */
function capped(max: number) {
  return z
    .string()
    .max(max * 4)
    .nullish()
    .transform((value) => (value ?? "").slice(0, max))
}

function items<T extends z.ZodTypeAny>(schema: T, max: number) {
  return z
    .array(schema)
    .max(max * 4)
    .nullish()
    .transform((value) => (value ?? []).slice(0, max))
}

const positionSchema = z.object({
  title: capped(200),
  company: capped(200),
  dates: capped(120),
  location: capped(120),
  description: capped(3000),
})

const educationSchema = z.object({
  school: capped(200),
  degree: capped(300),
  dates: capped(120),
})

export const ProfileSectionsSchema = z.object({
  name: capped(120),
  headline: capped(300),
  location: capped(160),
  about: capped(4000),
  experience: items(positionSchema, MAX_ITEMS),
  education: items(educationSchema, MAX_ITEMS),
  skills: items(capped(80), 100),
  certifications: items(capped(160), MAX_ITEMS),
  languages: items(capped(80), MAX_ITEMS),
})
export type ProfileSections = z.infer<typeof ProfileSectionsSchema>

export const LinkedInAuditBodySchema = z.object({
  sections: ProfileSectionsSchema,
  profileUrl: z.string().max(400).nullish(),
  /** Run the model again even when the document did not change */
  force: z.boolean().nullish(),
  locale: z.enum(["pl", "en"]).nullish(),
})
export type LinkedInAuditBody = z.infer<typeof LinkedInAuditBodySchema>

/** Null without a headline, About, a role or a skill: a name and a city are not a profile. */
export function documentFromSections(sections: ProfileSections): LinkedInDocument | null {
  const substance =
    sections.headline || sections.about || sections.experience.length || sections.skills.length
  if (!substance) return null
  const text = linkedInLayout(sectionsFromUnknown(sections))
  if (text.trim().length < 20) return null
  return parseLinkedInProfile(text)
}

// ---------------------------------------------------------------------- what the extension shows

export type ProfileAuditNote = {
  id: string
  category: AuditCategory
  label: string
  severity: number
  sectionId: string
  /** "Doświadczenie · Head of Engineering": where on the page the note belongs */
  section: string
  field: PartField
  quote: string
  why: string
  rewrite: string
  factId: string | null
}

export type ProfileAuditRead = {
  name: boolean
  headline: boolean
  about: boolean
  experience: number
  education: number
  skills: number
}

export type ProfileAuditView = {
  score: number
  previousScore: number | null
  progress: string | null
  summary: string
  auditedAt: string
  /** False when the stored audit was returned because the profile did not change */
  fresh: boolean
  notes: ProfileAuditNote[]
  /** Phrases common in the matched offers and missing from the profile */
  demand: {
    id: string
    role: string
    phrase: string
    percent: number
    matchingOffers: number
    totalOffers: number
  }[]
  read: ProfileAuditRead | null
}

const KIND_LABEL: Record<AuditLocale, Record<BlockKind, string>> = {
  en: {
    headline: "Headline",
    about: "About",
    experience: "Experience",
    education: "Education",
    skills: "Skills",
  },
  pl: {
    headline: "Nagłówek",
    about: "O mnie",
    experience: "Doświadczenie",
    education: "Wykształcenie",
    skills: "Umiejętności",
  },
}

function sectionName(
  document: LinkedInDocument | null,
  sectionId: string,
  locale: AuditLocale
): string {
  const block = document?.blocks.find((candidate) => candidate.id === sectionId)
  if (!block) return sectionId
  const title = block.parts.find((part) => part.field === "title")?.text.trim()
  const base = KIND_LABEL[locale][block.kind]
  return title ? `${base} · ${title.slice(0, 60)}` : base
}

/** What the page gave the audit, so the panel can say what it did and did not see. */
export function readSummary(document: LinkedInDocument): ProfileAuditRead {
  const count = (kind: BlockKind) => document.blocks.filter((block) => block.kind === kind).length
  const skills = document.blocks.find((block) => block.kind === "skills")
  const skillCount = skills
    ? skills.parts
        .flatMap((part) => part.text.split(/[·•|,]/))
        .filter((item) => item.trim().length > 1).length
    : 0
  return {
    name: Boolean(document.name),
    headline: count("headline") > 0,
    about: count("about") > 0,
    experience: count("experience"),
    education: count("education"),
    skills: skillCount,
  }
}

export function auditView(
  audit: BuiltAudit,
  document: LinkedInDocument | null,
  auditedAt: Date,
  fresh: boolean,
  locale: AuditLocale
): ProfileAuditView {
  return {
    score: audit.score,
    previousScore: audit.previousScore,
    progress: progressCopy(audit.score, audit.previousScore, locale),
    summary: audit.summary,
    auditedAt: auditedAt.toISOString(),
    fresh,
    notes: audit.annotations.map((item) => ({
      id: item.id,
      category: item.category,
      label: categoryLabel(item.category, locale),
      severity: item.severity,
      sectionId: item.sectionId,
      section: sectionName(document, item.sectionId, locale),
      field: item.field,
      quote: item.quote,
      why: item.why,
      rewrite: item.rewrite,
      factId: item.factId,
    })),
    demand: audit.demand
      .filter((fact) => fact.qualifies)
      .map((fact) => ({
        id: fact.id,
        role: fact.role,
        phrase: phraseLabel(fact, locale),
        percent: fact.percent,
        matchingOffers: fact.matchingOffers,
        totalOffers: fact.totalOffers,
      })),
    read: document ? readSummary(document) : null,
  }
}

// ---------------------------------------------------------------------- stored runs

/** An audit run as a store keeps it: the columns of BuiltAudit and when it ran. */
export type StoredAuditRun = {
  score: number
  previousScore: number | null
  summary: string
  topChanges: unknown
  annotations: unknown
  demand: unknown
  documentHash: string
  createdAt: Date
}

/** A stored run back as a BuiltAudit; null when it no longer fits the schema. */
export function parseStoredAudit(row: StoredAuditRun): BuiltAudit | null {
  const parsed = builtAuditSchema.safeParse({
    score: row.score,
    previousScore: row.previousScore,
    summary: row.summary,
    topChanges: row.topChanges,
    annotations: row.annotations,
    demand: row.demand,
    documentHash: row.documentHash,
  })
  return parsed.success ? parsed.data : null
}
