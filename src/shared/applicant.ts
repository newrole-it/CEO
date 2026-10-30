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
