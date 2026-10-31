import db from "db"
import {
  APPLICANT_FIELDS,
  ApplicantInfoSchema,
  parseApplicant,
  splitName,
  type ApplicantInfo,
} from "src/shared/applicant"

export type ApplicantView = {
  /** What the person saved */
  saved: ApplicantInfo
  /** Saved values with gaps filled from the account, the profile and the default CV header */
  effective: ApplicantInfo
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** Read the header of a CvDocument.content without depending on its full schema. */
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

/** Saved form details, plus defaults the person has not overridden. */
export async function getApplicant(userId: number): Promise<ApplicantView> {
  const [user, profile, cv] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true, applicant: true, role: true },
    }),
    db.candidateProfile.findUnique({ where: { userId }, select: { homeCity: true } }),
    db.cvDocument.findFirst({
      where: { userId, kind: "EDITABLE", docType: "CV" },
      orderBy: [
        { isDefault: "desc" },
        { targetCompany: { sort: "desc", nulls: "first" } },
        { updatedAt: "desc" },
      ],
      select: { content: true },
    }),
  ])
  const saved = parseApplicant(user?.applicant)
  const fromCv = cvHeaderFacts(cv?.content)
  const defaults: ApplicantInfo = {
    ...splitName(user?.name),
    ...fromCv,
    email: fromCv.email ?? (user && user.role !== "GUEST" ? user.email : undefined),
    city: fromCv.city ?? profile?.homeCity ?? undefined,
  }
  const effective: ApplicantInfo = {}
  for (const key of APPLICANT_FIELDS) {
    const value = saved[key] ?? defaults[key]
    if (value) effective[key] = value
  }
  return { saved, effective }
}

/** Replaces the saved details. Empty strings clear a field. */
export async function saveApplicant(userId: number, input: ApplicantInfo): Promise<ApplicantView> {
  const parsed = ApplicantInfoSchema.parse(input)
  const clean: ApplicantInfo = {}
  for (const key of APPLICANT_FIELDS) {
    const value = parsed[key]?.trim()
    if (value) clean[key] = value
  }
  await db.user.update({ where: { id: userId }, data: { applicant: clean } })
  return getApplicant(userId)
}
