import { blankCv, defaultConsent, SECTION_TITLES, emptyCv, type CvLocale } from "./blank"
import { textToInline } from "./sanitize"
import {
  cvId,
  parseCvContent,
  type CvContent,
  type CvExperienceItem,
  type CvSection,
} from "./schema"

/**
 * The parts of the stored imported CV / LinkedIn document this module reads
 * (LinkedInDocument in src/server/profile/linkedin.ts, structurally).
 */
export type ImportedDocument = {
  name: string | null
  location: string | null
  blocks: {
    kind: "headline" | "about" | "experience" | "education" | "skills"
    parts: { field: "title" | "subtitle" | "body"; text: string }[]
  }[]
}

export type CvProfileInput = {
  locale: CvLocale
  name?: string | null
  email?: string | null
  document?: ImportedDocument | null
  profile?: {
    headline?: string | null
    currentTitle?: string | null
    homeCity?: string | null
    locations?: string[]
    skills?: string[]
    languages?: string[]
  } | null
  /** Saved form details (@newrole/profile/applicant) */
  applicant?: {
    firstName?: string
    lastName?: string
    email?: string
    phone?: string
    city?: string
    linkedinUrl?: string
    githubUrl?: string
    websiteUrl?: string
  } | null
}

function part(
  block: ImportedDocument["blocks"][number],
  field: "title" | "subtitle" | "body"
): string {
  return block.parts.find((item) => item.field === field)?.text.trim() ?? ""
}

const DATE_PIECE = /\b(?:19|20)\d{2}\b|\b(?:present|current|obecnie)\b/i

/** "Allegro · Jan 2020 - Present · Warszawa" → company and dates. */
function splitSubtitle(subtitle: string): { organization: string; dates: string } {
  const pieces = subtitle
    .split("·")
    .map((piece) => piece.trim())
    .filter(Boolean)
  const dateAt = pieces.findIndex((piece) => DATE_PIECE.test(piece))
  if (dateAt < 0) return { organization: pieces.join(" · "), dates: "" }
  return { organization: pieces.slice(0, dateAt).join(" · "), dates: pieces[dateAt] }
}

const BULLET_LINE = /^\s*[-*•·–—▪◦]\s+/

/** Free text → the summary paragraph plus bullet lines. */
function splitBody(body: string): { summary: string; bullets: string[] } {
  const lines = body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const summary: string[] = []
  const bullets: string[] = []
  for (const line of lines) {
    if (BULLET_LINE.test(line)) bullets.push(line.replace(BULLET_LINE, ""))
    else if (bullets.length) bullets[bullets.length - 1] += ` ${line}`
    else summary.push(line)
  }
  return { summary: summary.join(" "), bullets }
}

function linkLabel(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "")
}

/**
 * A first CV from what the person already gave us: the imported document's sections, the
 * profile and the saved form details. Falls back to the blank template's sections when there
 * is nothing imported yet, so the result is always a complete, editable document.
 */
export function cvFromProfile(input: CvProfileInput): CvContent {
  const { locale, document, profile, applicant } = input
  const titles = SECTION_TITLES[locale]
  const blocks = document?.blocks ?? []
  const named = [applicant?.firstName, applicant?.lastName].filter(Boolean).join(" ").trim()
  const name = named || document?.name?.trim() || input.name?.trim() || ""

  const about = blocks.filter((block) => block.kind === "about").map((block) => part(block, "body"))
  const headline =
    blocks.filter((block) => block.kind === "headline").map((block) => part(block, "body"))[0] ||
    profile?.headline?.trim() ||
    profile?.currentTitle?.trim() ||
    ""

  const links = [applicant?.linkedinUrl, applicant?.githubUrl, applicant?.websiteUrl]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url && /^https?:\/\//i.test(url)))
    .map((url) => ({ label: linkLabel(url), url }))

  const sections: CvSection[] = []
  const aboutText = about.filter(Boolean).join("\n").trim()
  if (aboutText) {
    sections.push({
      id: cvId("s"),
      type: "text",
      title: titles.profile,
      body: textToInline(aboutText),
    })
  }

  const skillText = blocks
    .filter((block) => block.kind === "skills")
    .map((block) => part(block, "body"))
    .filter(Boolean)
    .join(" · ")
  const skills = skillText || (profile?.skills ?? []).filter(Boolean).slice(0, 30).join(" · ")
  if (skills) {
    sections.push({
      id: cvId("s"),
      type: "skills",
      title: titles.skills,
      items: [
        {
          id: cvId("i"),
          label: locale === "pl" ? "Technologie" : "Technology",
          text: textToInline(skills),
        },
      ],
    })
  }

  const jobs: CvExperienceItem[] = blocks
    .filter((block) => block.kind === "experience")
    .slice(0, 40)
    .map((block) => {
      const { organization, dates } = splitSubtitle(part(block, "subtitle"))
      const { summary, bullets } = splitBody(part(block, "body"))
      return {
        id: cvId("i"),
        company: organization || part(block, "title"),
        role: organization ? part(block, "title") : "",
        dates,
        summary: textToInline(summary),
        bullets: bullets.slice(0, 40).map((bullet) => textToInline(bullet)),
        tech: "",
        compact: false,
      }
    })
  if (jobs.length) {
    // older roles without bullets use the tighter spacing, like the reference layout
    for (const job of jobs) job.compact = job.bullets.length === 0
    sections.push({ id: cvId("s"), type: "experience", title: titles.experience, items: jobs })
  }

  const schools = blocks
    .filter((block) => block.kind === "education")
    .slice(0, 30)
    .map((block) => {
      const { organization, dates } = splitSubtitle(part(block, "subtitle"))
      const title = part(block, "title")
      return {
        id: cvId("i"),
        school: organization || title,
        degree: organization ? title : part(block, "body"),
        dates,
      }
    })
  if (schools.length)
    sections.push({ id: cvId("s"), type: "education", title: titles.education, items: schools })

  const languages = (profile?.languages ?? []).filter(Boolean)
  if (languages.length) {
    sections.push({
      id: cvId("s"),
      type: "text",
      title: titles.languages,
      body: textToInline(languages.join(" · ")),
    })
  }

  const fallback = blankCv(locale)
  const content: CvContent = {
    ...emptyCv(),
    header: {
      name: name.slice(0, 120),
      headline: headline.slice(0, 300),
      location: (
        applicant?.city ||
        document?.location ||
        profile?.homeCity ||
        profile?.locations?.[0] ||
        ""
      )
        .trim()
        .slice(0, 160),
      email: (applicant?.email || input.email || "").trim().slice(0, 200),
      phone: (applicant?.phone || "").trim().slice(0, 60),
      links: links.slice(0, 8),
      photo: null,
    },
    sections: sections.length ? sections : fallback.sections,
    consent: defaultConsent(locale),
  }
  // the imported text has limits of its own; never hand back something the schema rejects
  return (
    parseCvContent(content) ?? {
      ...fallback,
      header: { ...fallback.header, name: content.header.name, email: content.header.email },
    }
  )
}
