import db from "db"
import {
  cleanApplicant,
  cvHeaderFacts,
  parseApplicant,
  splitName,
  withDefaults,
  type ApplicantInfo,
} from "@newrole/profile/applicant"

export { cvHeaderFacts }

export type ApplicantView = {
  /** What the person saved */
  saved: ApplicantInfo
  /** Saved values with gaps filled from the account, the profile and the default CV header */
  effective: ApplicantInfo
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
  return { saved, effective: withDefaults(saved, defaults) }
}

/** Replaces the saved details. Empty strings clear a field. */
export async function saveApplicant(userId: number, input: ApplicantInfo): Promise<ApplicantView> {
  await db.user.update({ where: { id: userId }, data: { applicant: cleanApplicant(input) } })
  return getApplicant(userId)
}
