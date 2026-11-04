import { buildCvAudit } from "@newrole/cv-engine/audit"
import { parseCvAudit, type CvAudit } from "@newrole/cv-core/audit"
import type { CvLocale } from "@newrole/cv-core/blank"
import { cvFromProfile } from "@newrole/cv-core/from-profile"
import { detectLanguage } from "@newrole/cv-core/language"
import { letterSection } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { createLlmClient } from "@newrole/llm/client"
import type { LlmClient } from "@newrole/llm/common"
import {
  cleanApplicant,
  cvHeaderFacts,
  withDefaults,
  type ApplicantInfo,
} from "@newrole/profile/applicant"
import { buildProfileAudit, type AuditLocale } from "@newrole/profile/audit"
import { candidateContextText } from "@newrole/profile/context"
import { draftFromText, importText } from "@newrole/profile/import-text"
import { profileText } from "@newrole/profile/linkedin"
import { auditView, type ProfileAuditView } from "@newrole/profile/linkedin-audit"
import { readLinkedInViaClaude } from "@newrole/profile/linkedin-browser"
import { linkedInJobs } from "@newrole/profile/linkedin-jobs"
import { profileDraftSchema, type ProfileDraft } from "@newrole/profile/schema"
import {
  createDocument,
  defaultCv,
  getDocument,
  getDocumentAudit,
  getProfile,
  setDocumentAudit,
  StoreError,
  updateProfile,
  type CvDocument,
} from "./store"

/**
 * The person's profile in newrole CV, as in newrole.it (@newrole/profile): read from a CV, a PDF,
 * LinkedIn's data export or their LinkedIn page in their own Chrome, reviewed and saved, then used
 * for "CV from profile", as the facts a model may use, and for the form details. There are no
 * offers to compare with here, so the audits run without demand facts.
 */

/** One person, one machine: the LinkedIn import jobs all belong to them. */
const OWNER = "local"

export class ProfileError extends Error {
  constructor(
    readonly code: "invalid" | "no-profile" | "no-content",
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

/** Text from a pasted CV, a PDF or LinkedIn's ZIP → a draft to review. The sections are kept now. */
async function draftAndKeep(text: string, llm: LlmClient | null): Promise<{ draft: ProfileDraft }> {
  const { draft, document } = await draftFromText(text, llm)
  if (document) await updateProfile({ document, importedAt: new Date() })
  return { draft }
}

export async function importProfile(
  input: { text?: string; file?: File | null },
  llm: LlmClient | null = createLlmClient()
): Promise<{ draft: ProfileDraft }> {
  const read = await importText(input)
  if (!read.ok) throw new ProfileError("invalid", read.error, read.status)
  return draftAndKeep(read.text, llm)
}

/** Starts reading the person's LinkedIn through Claude in their Chrome; poll with browserImport. */
export function startBrowserImport(): { jobId: string } {
  const { id } = linkedInJobs().start(OWNER, async ({ stage }) => {
    const read = await readLinkedInViaClaude({ onStage: stage })
    if (read.status !== "ok" || !read.text) return { status: read.status, message: read.message }
    stage("analyzing")
    const { draft } = await draftAndKeep(read.text, createLlmClient())
    return { status: "ok", message: read.message, draft }
  })
  return { jobId: id }
}

export function browserImport(jobId: string) {
  return linkedInJobs().get(jobId, OWNER)
}

export async function saveDraft(input: unknown): Promise<ProfileDraft> {
  const parsed = profileDraftSchema.safeParse(input)
  if (!parsed.success) throw new ProfileError("invalid", "That profile is not valid.")
  const profile = await updateProfile({ draft: parsed.data })
  return profile.draft ?? parsed.data
}

/** Saved form details, and each empty field filled from the CV header or the profile. */
export async function applicantView(): Promise<{ saved: ApplicantInfo; effective: ApplicantInfo }> {
  const [profile, cv] = await Promise.all([getProfile(), defaultCv()])
  const fromCv = cvHeaderFacts(cv?.content)
  const defaults: ApplicantInfo = {
    ...fromCv,
    city: fromCv.city ?? profile.draft?.homeCity ?? undefined,
  }
  return { saved: profile.applicant, effective: withDefaults(profile.applicant, defaults) }
}

export async function saveApplicantDetails(input: ApplicantInfo) {
  let clean: ApplicantInfo
  try {
    clean = cleanApplicant(input)
  } catch {
    throw new ProfileError("invalid", "Those details are not valid.")
  }
  await updateProfile({ applicant: clean })
  return applicantView()
}

/** "Z profilu": a CV laid out from the imported sections, the profile and the form details. */
export async function cvFromMyProfile(locale: CvLocale): Promise<CvDocument> {
  const profile = await getProfile()
  if (!profile.document && !profile.draft) {
    throw new ProfileError("no-profile", "There is no profile to start from.", 409)
  }
  const draft = profile.draft
  const content = cvFromProfile({
    locale,
    applicant: profile.applicant,
    document: profile.document,
    profile: draft
      ? {
          headline: draft.headline,
          currentTitle: draft.currentTitle,
          homeCity: draft.homeCity,
          locations: draft.locations,
          skills: draft.skills,
          languages: draft.languages,
        }
      : null,
  })
  const title = locale === "en" ? "CV from my profile" : "CV z profilu"
  return createDocument({ title, language: locale, content })
}

/** What a model may know about the person when writing for them (@newrole/profile/context). */
export async function candidateContext(): Promise<string> {
  const [profile, cv] = await Promise.all([getProfile(), defaultCv()])
  const name = [profile.applicant.firstName, profile.applicant.lastName].filter(Boolean).join(" ")
  return candidateContextText({
    name: name || null,
    profile: profile.draft,
    cvText: cv ? cvPlainText(cv.content) : null,
    document: profile.document,
  })
}

// ------------------------------------------------------------------ audits

export async function auditDocument(
  id: string,
  locale: CvLocale,
  llm: LlmClient | null = createLlmClient()
): Promise<CvAudit> {
  const document = await getDocument(id)
  if (!document) throw new StoreError("not-found", "Document not found.")
  if (letterSection(document.content)) {
    throw new ProfileError("no-content", "This document has no editable CV to audit.", 422)
  }
  const previous = await getDocumentAudit(id)
  const audit = await buildCvAudit({
    content: document.content,
    language: document.language,
    locale,
    facts: [],
    noIndex: true,
    llm,
    previousScore: previous?.score ?? null,
    dismissed: previous?.dismissed,
  })
  await setDocumentAudit(id, audit)
  return audit
}

/** Sets which notes of the latest audit are skipped. Returns the audit as stored. */
export async function dismissAuditNotes(id: string, dismissed: string[]): Promise<CvAudit> {
  const audit = parseCvAudit(await getDocumentAudit(id))
  if (!audit) throw new StoreError("not-found", "CV audit not found.")
  const ids = new Set(audit.notes.map((note) => note.id))
  const next = { ...audit, dismissed: dismissed.filter((noteId) => ids.has(noteId)) }
  await setDocumentAudit(id, next)
  return next
}

/** The profile audit of the imported CV or LinkedIn sections: the score the extension shows. */
export async function auditProfile(
  locale: AuditLocale,
  llm: LlmClient | null = createLlmClient()
): Promise<ProfileAuditView> {
  const profile = await getProfile()
  if (!profile.document) {
    throw new ProfileError("no-profile", "Import a CV or your LinkedIn profile first.", 409)
  }
  const audit = await buildProfileAudit({
    document: profile.document,
    facts: [],
    noIndex: true,
    llm,
    previousScore: profile.audit?.score ?? null,
    locale,
    language: detectLanguage(profileText(profile.document)),
  })
  const auditedAt = new Date()
  await updateProfile({ audit, auditedAt })
  return auditView(audit, profile.document, auditedAt, true, locale)
}

export async function latestProfileAudit(locale: AuditLocale): Promise<ProfileAuditView | null> {
  const profile = await getProfile()
  if (!profile.audit || !profile.auditedAt) return null
  return auditView(profile.audit, profile.document, profile.auditedAt, false, locale)
}
