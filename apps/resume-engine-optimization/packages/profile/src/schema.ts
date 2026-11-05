import { z } from "zod"

export const seniorityValues = [
  "intern",
  "junior",
  "mid",
  "senior",
  "lead",
  "principal",
  "manager",
  "senior_manager",
  "head",
  "director",
  "vp",
  "c_level",
] as const

export const industryModes = ["stick", "prefer", "any"] as const
export type IndustryMode = (typeof industryModes)[number]

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export const profileDraftSchema = z.object({
  headline: z.preprocess(emptyToNull, z.string().max(200).nullable()),
  currentTitle: z.preprocess(emptyToNull, z.string().max(120).nullable()),
  pastTitles: z.array(z.string().trim().min(1).max(120)).max(12),
  seniority: z.preprocess(emptyToNull, z.enum(seniorityValues).nullable()),
  yearsExperience: z.number().min(0).max(60).nullable(),
  skills: z.array(z.string().trim().min(1).max(60)).max(40),
  industries: z.array(z.string().trim().min(1).max(40)).max(8),
  locations: z.array(z.string().trim().min(1).max(80)).max(8),
  languages: z.array(z.string().trim().min(1).max(40)).max(8),
  salaryFloor: z.number().min(0).max(10_000_000).nullable(),
  salaryTarget: z.number().min(0).max(10_000_000).nullable(),
  salaryCurrency: z.preprocess(emptyToNull, z.enum(["PLN", "EUR", "USD", "GBP", "CHF"]).nullable()),
  salaryPeriod: z.preprocess(emptyToNull, z.enum(["month", "year"]).nullable()),
  salaryContract: z.preprocess(emptyToNull, z.enum(["uop", "b2b"]).nullable()),
  contracts: z.array(z.string().trim().min(1).max(40)).max(6),
  remotePreference: z.preprocess(
    emptyToNull,
    z.enum(["remote", "hybrid", "onsite", "any"]).nullable()
  ),
  homeCity: z.preprocess(emptyToNull, z.string().max(80).nullable()),
  relocation: z.boolean().nullable(),
  industryMode: z.enum(industryModes).default("prefer"),
})

export type ProfileDraft = z.infer<typeof profileDraftSchema>

export function emptyProfileDraft(): ProfileDraft {
  return {
    headline: null,
    currentTitle: null,
    pastTitles: [],
    seniority: null,
    yearsExperience: null,
    skills: [],
    industries: [],
    locations: [],
    languages: [],
    salaryFloor: null,
    salaryTarget: null,
    salaryCurrency: "PLN",
    salaryPeriod: "month",
    salaryContract: "b2b",
    contracts: [],
    remotePreference: null,
    homeCity: null,
    relocation: null,
    industryMode: "prefer",
  }
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
}
