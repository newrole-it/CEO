import db from "db"
import { parseCvContent } from "@newrole/cv-core/schema"
import { cvPlainText } from "@newrole/cv-core/text"
import { asStringList } from "./schema"
import { parseStoredDocument, profileText } from "./linkedin"

/**
 * What a model may know about the candidate when writing for them: the structured profile,
 * the default CV (or the newest editable one, without hidden sections) and the imported
 * CV/LinkedIn sections. Capped at maxChars; the CV comes before the imported sections because
 * it is curated.
 */
export async function candidateContext(userId: number, maxChars = 9000): Promise<string> {
  const [user, profile, cv] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { name: true } }),
    db.candidateProfile.findUnique({ where: { userId } }),
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
  const parts: string[] = []
  if (user?.name) parts.push(`Name: ${user.name}`)
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
  const content = parseCvContent(cv?.content)
  if (content) {
    const text = cvPlainText(content)
    if (text) parts.push(`\nCV:\n${text}`)
  }
  const document = parseStoredDocument(profile?.linkedinDocument)
  if (document) {
    const text = profileText(document)
    if (text) parts.push(`\nImported CV / LinkedIn sections:\n${text}`)
  }
  const joined = parts.join("\n").trim()
  return joined.length > maxChars ? joined.slice(0, maxChars) : joined
}
