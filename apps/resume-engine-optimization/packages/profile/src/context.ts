import { asStringList } from "./schema"
import { profileText, type LinkedInDocument } from "./linkedin"

/** The profile fields a model may see, as a store keeps them (lists may be JSON). */
export type ContextProfile = {
  headline?: unknown
  currentTitle?: unknown
  seniority?: unknown
  yearsExperience?: unknown
  pastTitles?: unknown
  skills?: unknown
  industries?: unknown
  languages?: unknown
  locations?: unknown
  remotePreference?: unknown
}

/**
 * What a model may know about the candidate when writing for them: the structured profile, the
 * CV's text (without hidden sections) and the imported CV/LinkedIn sections. Capped at maxChars;
 * the CV comes before the imported sections because it is curated.
 */
export function candidateContextText(input: {
  name?: string | null
  profile?: ContextProfile | null
  cvText?: string | null
  document?: LinkedInDocument | null
  maxChars?: number
}): string {
  const { name, profile, cvText, document } = input
  const maxChars = input.maxChars ?? 9000
  const parts: string[] = []
  if (name) parts.push(`Name: ${name}`)
  if (profile) {
    const line = (label: string, value: unknown) => {
      const text = Array.isArray(value)
        ? asStringList(value).join(", ")
        : value == null
        ? ""
        : String(value)
      if (text.trim()) parts.push(`${label}: ${text.trim()}`)
    }
    line("Headline", profile.headline)
    line("Current title", profile.currentTitle)
    line("Seniority", profile.seniority)
    line("Years of experience", profile.yearsExperience)
    line("Past titles", profile.pastTitles)
    line("Skills", profile.skills)
    line("Industries", profile.industries)
    line("Languages", profile.languages)
    line("Locations", profile.locations)
    line("Work mode", profile.remotePreference)
  }
  if (cvText) parts.push(`\nCV:\n${cvText}`)
  const imported = document ? profileText(document) : ""
  if (imported) parts.push(`\nImported CV / LinkedIn sections:\n${imported}`)
  const joined = parts.join("\n").trim()
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}
