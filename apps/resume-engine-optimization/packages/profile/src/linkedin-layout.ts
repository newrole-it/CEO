/**
 * One text layout for every LinkedIn source (the profile page read in Chrome, the data
 * export ZIP). It is the shape LinkedIn's "Save to PDF" produces, so parseLinkedInProfile
 * and extractProfileFromText read it without a special case.
 */

export type LinkedInPosition = {
  title?: string | null
  company?: string | null
  dates?: string | null
  location?: string | null
  description?: string | null
}

export type LinkedInEducation = {
  school?: string | null
  degree?: string | null
  dates?: string | null
}

export type LinkedInSections = {
  name?: string | null
  headline?: string | null
  location?: string | null
  about?: string | null
  experience?: LinkedInPosition[]
  education?: LinkedInEducation[]
  skills?: string[]
  certifications?: string[]
  languages?: string[]
}

const MAX_ITEMS = 30
const MAX_FIELD = 4000

function clean(value: unknown, max = 300): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)
}

function oneLine(value: unknown, max = 200): string {
  return clean(value, max).replace(/\s*\n\s*/g, " · ")
}

function list(values: unknown, max = MAX_ITEMS): string[] {
  if (!Array.isArray(values)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const item = oneLine(value, 120)
    const key = item.toLowerCase()
    if (!item || seen.has(key)) continue
    seen.add(key)
    out.push(item)
    if (out.length >= max) break
  }
  return out
}

/** Dates on their own line, so the parser can split one position from the next. */
function datesLine(value: unknown): string {
  const dates = oneLine(value, 90)
  if (!dates) return ""
  return /\b(?:19|20)\d{2}\b/.test(dates) ? dates : ""
}

export function linkedInLayout(sections: LinkedInSections): string {
  const lines: string[] = []
  const push = (...values: string[]) => values.filter(Boolean).forEach((value) => lines.push(value))
  push(
    oneLine(sections.name, 120),
    oneLine(sections.headline, 220),
    oneLine(sections.location, 120)
  )

  const about = clean(sections.about, MAX_FIELD)
  if (about) push("Summary", about)

  const positions = (sections.experience ?? []).slice(0, MAX_ITEMS)
  if (positions.length) {
    push("Experience")
    for (const position of positions) {
      const company = oneLine(position.company, 120)
      const title = oneLine(position.title, 120)
      if (!company && !title) continue
      push(company, title, datesLine(position.dates), oneLine(position.location, 80))
      push(clean(position.description, 1500))
    }
  }

  const schools = (sections.education ?? []).slice(0, MAX_ITEMS)
  if (schools.length) {
    push("Education")
    for (const school of schools) {
      const name = oneLine(school.school, 160)
      if (!name) continue
      push(name, oneLine(school.degree, 200), datesLine(school.dates))
    }
  }

  const skills = list(sections.skills, 60)
  if (skills.length) push("Skills", ...skills)
  const languages = list(sections.languages)
  if (languages.length) push("Languages", ...languages)
  const certifications = list(sections.certifications)
  if (certifications.length) push("Certifications", ...certifications)
  return lines.join("\n")
}

/** Tolerates what a model returns: arrays of strings or objects, or one blob of text. */
export function sectionsFromUnknown(value: unknown): LinkedInSections {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const asObjects = <T>(raw: unknown, fromText: (text: string) => T): T[] => {
    if (typeof raw === "string") {
      return raw
        .split(/\n\s*\n/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .map(fromText)
    }
    if (!Array.isArray(raw)) return []
    return raw
      .map((item) =>
        typeof item === "string"
          ? fromText(item)
          : item && typeof item === "object"
            ? (item as T)
            : null
      )
      .filter((item): item is NonNullable<typeof item> => item != null) as T[]
  }
  const splitList = (raw: unknown): string[] =>
    typeof raw === "string"
      ? raw.split(/\n|,|·|•/).map((item) => item.trim())
      : Array.isArray(raw)
        ? raw.map((item) =>
            typeof item === "string"
              ? item
              : item && typeof item === "object"
                ? String((item as Record<string, unknown>).name ?? "")
                : ""
          )
        : []
  return {
    name: typeof record.name === "string" ? record.name : null,
    headline: typeof record.headline === "string" ? record.headline : null,
    location: typeof record.location === "string" ? record.location : null,
    about: typeof record.about === "string" ? record.about : null,
    experience: asObjects<LinkedInPosition>(record.experience, (text) => {
      const [title, company, ...rest] = text.split("\n").map((line) => line.trim())
      return { title, company, description: rest.join("\n") }
    }),
    education: asObjects<LinkedInEducation>(record.education, (text) => {
      const [school, degree, dates] = text.split("\n").map((line) => line.trim())
      return { school, degree, dates }
    }),
    skills: splitList(record.skills),
    certifications: splitList(record.certifications),
    languages: splitList(record.languages),
  }
}
