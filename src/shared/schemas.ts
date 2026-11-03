import { z } from "zod"

export const workplaceTypeSchema = z.enum(["REMOTE", "HYBRID", "ONSITE", "UNKNOWN"])
export type WorkplaceType = z.infer<typeof workplaceTypeSchema>

export const sourceTypeSchema = z.enum([
  "GREENHOUSE",
  "LEVER",
  "ASHBY",
  "WORKABLE",
  "SMARTRECRUITERS",
  "TRAFFIT",
  "RECRUITEE",
  "TEAMTAILOR",
  "PERSONIO",
  "PINPOINT",
  "BREEZY",
  "BAMBOOHR",
  "GENERIC_HTML",
  "WEB_SEARCH",
  "SUCCESSFACTORS",
  "WORKDAY",
  "ICIMS",
  "PHENOM",
  "AVATURE",
  "ERECRUITER",
  "JOBVITE",
  "CAREER_SITE",
  "EIGHTFOLD",
  "SOFTGARDEN",
  "BULLHORN",
  "ZOHO_RECRUIT",
  "RIPPLING",
  "GEM",
  "DOVER",
  "POLYMER",
  "COMEET",
  "HOMERUN",
  "DVINCI",
  "MANATAL",
  "ONLYFY",
  "REXX",
  "JAZZHR",
  "CATSONE",
  "LOXO",
  "TALENTLYFT",
  "FACTORIAL",
])
export type SourceType = z.infer<typeof sourceTypeSchema>

export const workModeSchema = z.enum(["ANY", "REMOTE", "HYBRID", "ONSITE"])
export type WorkMode = z.infer<typeof workModeSchema>

export const queryExpansionSchema = z.object({
  original: z.string().min(1).max(160),
  titles: z.array(z.string().min(2).max(80)).min(1).max(24),
  synonyms: z.array(z.string().min(1).max(80)).max(24),
  seniority: z.array(z.string().min(1).max(40)).max(8),
  exclusions: z.array(z.string().min(1).max(40)).max(24),
  skills: z.array(z.string().min(1).max(40)).max(24),
  notes: z.string().max(400).optional(),
  source: z.enum(["rules", "llm", "mixed"]),
})
export type QueryExpansion = z.infer<typeof queryExpansionSchema>

export const llmExpansionSchema = queryExpansionSchema.pick({
  titles: true,
  synonyms: true,
  seniority: true,
  exclusions: true,
  skills: true,
  notes: true,
})

export const matchExplanationSchema = z.object({
  reason: z.string().min(8).max(280),
})

export const titleNormalizationSchema = z.object({
  normalizedTitle: z.string().min(2).max(120),
  seniority: z.enum([
    "intern",
    "junior",
    "mid",
    "senior",
    "staff",
    "principal",
    "manager",
    "director",
    "executive",
    "unspecified",
  ]),
})

export const senioritySchema = titleNormalizationSchema.shape.seniority
export type Seniority = z.infer<typeof senioritySchema>

export const sourceJobSchema = z.object({
  externalId: z.string().min(1).optional(),
  title: z.string().min(1),
  companyName: z.string().min(1).optional(),
  locationText: z.string().optional(),
  /** Countries the ATS states in its own fields (ISO codes or names). The location text is read too. */
  countryCodes: z.array(z.string()).optional(),
  employmentType: z.string().optional(),
  workplaceType: workplaceTypeSchema,
  descriptionText: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().min(3).max(24).optional(),
  /** Original pay phrase. Matching converts this; it is not parsed out of the description. */
  salaryText: z.string().max(400).optional(),
  publishedAt: z.date().optional(),
  originalUrl: z.string().url(),
  sourceType: sourceTypeSchema,
  sourceBoardId: z.string().min(1).optional(),
})
export type SourceJob = z.infer<typeof sourceJobSchema>

export const createSearchInputSchema = z.object({
  phrase: z.string().trim().min(2, "Enter at least two characters").max(160),
  locationHint: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => (value ? value : undefined)),
  workMode: workModeSchema.optional().default("ANY"),
})
export type CreateSearchInput = z.infer<typeof createSearchInputSchema>

export const jobVariantSchema = z.object({
  title: z.string(),
  contract: z.string(),
  salaryText: z.string().optional(),
  salaryMin: z.number().optional(),
  salaryMax: z.number().optional(),
  salaryCurrency: z.string().optional(),
  url: z.string().url(),
  externalId: z.string().optional(),
})
export type JobVariant = z.infer<typeof jobVariantSchema>

export const listedJobSchema = sourceJobSchema.extend({
  needsHydration: z.boolean().default(false),
  llmOptOut: z.boolean().optional(),
  variants: z.array(jobVariantSchema).optional(),
})
export type ListedJob = z.infer<typeof listedJobSchema>
