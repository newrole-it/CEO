import { z } from "zod"

/**
 * Contact and form details stored in User.applicant. The Chrome extension fills standard
 * application fields from these without calling a model. Every field is optional.
 */
export const APPLICANT_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "city",
  "country",
  "linkedinUrl",
  "githubUrl",
  "websiteUrl",
  "noticePeriod",
  "availableFrom",
  "salaryExpectation",
  "workAuthorization",
  "relocation",
] as const

export type ApplicantField = (typeof APPLICANT_FIELDS)[number]

const text = (max: number) => z.string().trim().max(max).optional()

export const ApplicantInfoSchema = z.object({
  firstName: text(80),
  lastName: text(80),
  email: z.string().trim().max(180).optional(),
  phone: text(40),
  city: text(80),
  country: text(80),
  linkedinUrl: text(300),
  githubUrl: text(300),
  websiteUrl: text(300),
  /** e.g. "1 miesiąc", "immediately" */
  noticePeriod: text(80),
  /** Free text or an ISO date */
  availableFrom: text(40),
  /** e.g. "30 000 PLN netto B2B / mies." */
  salaryExpectation: text(160),
  /** e.g. "Obywatelstwo PL/UE, bez sponsorowania wizy" */
  workAuthorization: text(200),
  /** e.g. "Tak, w obrębie UE" */
  relocation: text(120),
})

export type ApplicantInfo = z.infer<typeof ApplicantInfoSchema>

/** Lenient read of the stored JSON: unknown keys and bad values are dropped. */
export function parseApplicant(value: unknown): ApplicantInfo {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const key of APPLICANT_FIELDS) {
    const raw = (value as Record<string, unknown>)[key]
    if (typeof raw !== "string") continue
    const parsed = ApplicantInfoSchema.shape[key].safeParse(raw)
    if (parsed.success && parsed.data) out[key] = parsed.data
  }
  return out as ApplicantInfo
}

/** "Rafał Testowy" → { firstName: "Rafał", lastName: "Testowy" }. */
export function splitName(name: string | null | undefined): {
  firstName?: string
  lastName?: string
} {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return {}
  if (parts.length === 1) return { firstName: parts[0] }
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** The contact details in a CV's header (CvContent), read without depending on its full schema. */
export function cvHeaderFacts(content: unknown): ApplicantInfo {
  if (!content || typeof content !== "object") return {}
  const header = (content as { header?: Record<string, unknown> }).header
  if (!header || typeof header !== "object") return {}
  const out: ApplicantInfo = { ...splitName(str(header.name)) }
  const email = str(header.email)
  const phone = str(header.phone)
  const location = str(header.location)
  if (email) out.email = email
  if (phone) out.phone = phone
  if (location) out.city = location
  const links = Array.isArray(header.links) ? header.links : []
  for (const link of links) {
    const url = str((link as { url?: unknown })?.url)
    if (!url) continue
    if (/linkedin\.com/i.test(url)) out.linkedinUrl ??= url
    else if (/github\.com/i.test(url)) out.githubUrl ??= url
    else if (/^https?:/i.test(url)) out.websiteUrl ??= url
  }
  return out
}

/** Saved values, with each empty field filled from `defaults` (the CV header, the account…). */
export function withDefaults(saved: ApplicantInfo, defaults: ApplicantInfo): ApplicantInfo {
  const effective: ApplicantInfo = {}
  for (const key of APPLICANT_FIELDS) {
    const value = saved[key] ?? defaults[key]
    if (value) effective[key] = value
  }
  return effective
}

/** Input as it is kept: checked, trimmed, empty fields left out. */
export function cleanApplicant(input: ApplicantInfo): ApplicantInfo {
  const parsed = ApplicantInfoSchema.parse(input)
  const clean: ApplicantInfo = {}
  for (const key of APPLICANT_FIELDS) {
    const value = parsed[key]?.trim()
    if (value) clean[key] = value
  }
  return clean
}
