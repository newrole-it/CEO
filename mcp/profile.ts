import type { CandidateProfile } from "@prisma/client"
import db from "db"
import { readFile, stat } from "fs/promises"
import { extname, isAbsolute } from "path"
import { createLlmClient, llmProvider } from "src/server/llm/client"
import { extractProfileFromText } from "src/server/profile/extract"
import { parseLinkedInProfile } from "src/server/profile/linkedin"
import { linkedInExportText, MAX_ZIP_BYTES } from "src/server/profile/linkedin-export"
import { extractPdfText } from "src/server/profile/pdf"
import { asStringList, type ProfileDraft } from "src/server/profile/schema"

/** Profile import for MCP: same extraction as /api/profile/import, saved like saveProfile. */

const MAX_PDF_BYTES = 8_000_000
const MAX_TEXT = 60_000

export type ProfilePreferences = {
  salaryFloorPln?: number
  salaryTargetPln?: number
  contract?: "uop" | "b2b"
  remotePreference?: "remote" | "hybrid" | "onsite" | "any"
  homeCity?: string
}

export async function readCvPdf(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("pdfPath must be an absolute path.")
  if (extname(path).toLowerCase() !== ".pdf") throw new Error("pdfPath must point to a .pdf file.")
  const info = await stat(path)
  if (!info.isFile()) throw new Error("pdfPath is not a file.")
  if (info.size > MAX_PDF_BYTES) throw new Error("That PDF is larger than 8 MB.")
  return extractPdfText(await readFile(path))
}

/** LinkedIn's data export archive (Settings → Data privacy → Get a copy of your data). */
export async function readLinkedInZip(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error("zipPath must be an absolute path.")
  if (extname(path).toLowerCase() !== ".zip") throw new Error("zipPath must point to a .zip file.")
  const info = await stat(path)
  if (!info.isFile()) throw new Error("zipPath is not a file.")
  if (info.size > MAX_ZIP_BYTES) throw new Error("That ZIP is larger than 50 MB.")
  return linkedInExportText(await readFile(path))
}

/** CV fields come from the import. Preferences the person set earlier stay unless given now. */
export function profileData(draft: ProfileDraft, prefs: ProfilePreferences, existing: boolean) {
  const cv = {
    headline: draft.headline,
    currentTitle: draft.currentTitle,
    pastTitles: draft.pastTitles,
    seniority: draft.seniority,
    yearsExperience: draft.yearsExperience,
    skills: draft.skills,
    industries: draft.industries,
    locations: draft.locations,
    languages: draft.languages,
  }
  const chosen = {
    ...(prefs.salaryFloorPln != null
      ? { salaryFloor: prefs.salaryFloorPln, salaryCurrency: "PLN", salaryPeriod: "month" }
      : {}),
    ...(prefs.salaryTargetPln != null ? { salaryTarget: prefs.salaryTargetPln } : {}),
    ...(prefs.contract ? { salaryContract: prefs.contract } : {}),
    ...(prefs.remotePreference ? { remotePreference: prefs.remotePreference } : {}),
    ...(prefs.homeCity ? { homeCity: prefs.homeCity.trim().slice(0, 80) } : {}),
  }
  const defaults = existing
    ? {}
    : {
        salaryCurrency: draft.salaryCurrency,
        salaryPeriod: draft.salaryPeriod,
        salaryContract: draft.salaryContract,
        industryMode: draft.industryMode,
      }
  return { ...cv, ...defaults, ...chosen }
}

export async function importProfile(args: {
  userId: number
  text?: string
  pdfPath?: string
  zipPath?: string
  preferences?: ProfilePreferences
}) {
  let text = (args.text ?? "").slice(0, MAX_TEXT)
  if (args.pdfPath) text = `${text}\n${await readCvPdf(args.pdfPath)}`.trim()
  if (args.zipPath) text = `${text}\n${await readLinkedInZip(args.zipPath)}`.trim()
  if (text.trim().length < 20)
    throw new Error("Pass the CV text (at least a few lines), pdfPath, or zipPath.")
  const llm = createLlmClient()
  const started = Date.now()
  const draft = await extractProfileFromText(text, llm, args.userId)
  const existing = await db.candidateProfile.findUnique({ where: { userId: args.userId } })
  const data = profileData(draft, args.preferences ?? {}, Boolean(existing))
  const document = parseLinkedInProfile(text)
  const linkedin = document ? { linkedinDocument: document, linkedinImportedAt: new Date() } : {}
  const profile = await db.candidateProfile.upsert({
    where: { userId: args.userId },
    update: { ...data, ...linkedin },
    create: { userId: args.userId, ...data, ...linkedin },
  })
  return { profile, reader: llm ? llmProvider() : "rules", ms: Date.now() - started }
}

export function loadProfile(userId: number) {
  return db.candidateProfile.findUnique({ where: { userId } })
}

export function profileSummary(profile: CandidateProfile) {
  return {
    headline: profile.headline,
    currentTitle: profile.currentTitle,
    pastTitles: asStringList(profile.pastTitles),
    seniority: profile.seniority,
    yearsExperience: profile.yearsExperience,
    skills: asStringList(profile.skills),
    industries: asStringList(profile.industries),
    locations: asStringList(profile.locations),
    languages: asStringList(profile.languages),
    salaryFloor: profile.salaryFloor,
    salaryTarget: profile.salaryTarget,
    salaryCurrency: profile.salaryCurrency,
    salaryPeriod: profile.salaryPeriod,
    salaryContract: profile.salaryContract,
    remotePreference: profile.remotePreference,
    homeCity: profile.homeCity,
    linkedinImported: Boolean(profile.linkedinImportedAt),
    updatedAt: profile.updatedAt.toISOString(),
  }
}
