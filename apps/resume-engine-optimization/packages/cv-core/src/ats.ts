import { z } from "zod"
import { inlineToText } from "./sanitize"
import type { CvContent } from "./schema"
import { mentionsTerm } from "./terms"
import { cvPlainText } from "./text"

/**
 * What an applicant tracking system and a recruiter's first look find in a CV, counted by code.
 * The checks follow the resume-ats-optimizer and resume-bullet-writer skills
 * (github.com/paramchoudhary/resumeskills at 74ae19e, MIT; copies are in newrole.it's
 * .claude/skills). No weighted score is made up here: the keyword match is the skill's own
 * formula, required keywords found over required keywords, and every other check is a count or
 * a yes or no.
 */

/**
 * A bullet that names a duty instead of a result, after the skill's "passive language" list:
 * "Responsible for", "Helped with", "Assisted in", "Participated in", "Worked on", and their
 * Polish forms. Regular expressions that read the person's text, not interface text.
 */
const WEAK_START =
  /^(?:(?:i )?(?:was |were )?(?:responsible for|helped|helping|assisted|assisting|participated|participating|worked on|working on|involved in|duties included)|(?:by[łl][ae]?m |by[łl]a? )?(?:odpowiedzialn\p{L}*|odpowiada\p{L}* za|pomaga\p{L}*|uczestnicz\p{L}*|(?:bra[łl]\p{L}*|bior\p{L}*) udzia[łl]|zajm\p{L}* si[ęe]|wspiera\p{L}*))(?![\p{L}])/iu

/** About two printed lines: the skill keeps a bullet to one or two. */
export const LONG_BULLET_CHARS = 220

/** A keyword found more often than this reads as stuffing (the skill's 2 to 4 times). */
export const KEYWORD_MOST = 4

/**
 * Section titles an ATS recognises. The English ones are the skill's ("Work Experience", not
 * "Where I've Been"; "Skills", not "Core Competencies"); the Polish ones are the common names.
 */
const STANDARD_TITLE = {
  experience: /do[śs]wiadczeni|\bexperience\b|\bemployment\b|zatrudnieni/iu,
  education: /wykszta[łl]ceni|edukacj|\beducation\b/iu,
  skills: /umiej[ęe]tno[śs]ci|kompetencj|\bskills\b/iu,
} as const

export const CvCheck = z.object({
  /** Bullets of the roles shown */
  bullets: z.number(),
  withNumber: z.number(),
  weakStart: z.number(),
  long: z.number(),
  /** Words of the profile (the first text section); null when there is none */
  profileWords: z.number().nullable(),
  email: z.boolean(),
  phone: z.boolean(),
  experience: z.boolean(),
  education: z.boolean(),
  skills: z.boolean(),
  /** Titles of experience, education and skills sections an ATS may not recognise */
  oddTitles: z.array(z.string()),
  /** Every role's dates start in the same form (MM.YYYY, YYYY, Month YYYY) */
  datesConsistent: z.boolean(),
})
export type CvCheck = z.infer<typeof CvCheck>

/** The text of a bullet without its "<strong>Project:</strong>" lead-in. */
function bulletBody(html: string): string {
  return inlineToText(html)
    .replace(/^[^:.!?]{1,60}:\s+/, "")
    .trim()
}

/** The form the first date of a range is written in, or null when it has none. */
function dateShape(dates: string): string | null {
  const text = dates.trim()
  const numeric = text.match(/\b\d{1,2}([./-])\d{4}\b/)
  if (numeric) return `mm${numeric[1]}yyyy`
  const named = text.match(/(\p{L}{3,})\.? (\d{4})\b/u)
  if (named && text.indexOf(named[0]) <= text.search(/\d{4}/)) return "month yyyy"
  return /\b\d{4}\b/.test(text) ? "yyyy" : null
}

/** The CV's shape as a recruiter scans it and an ATS parses it. */
export function checkCv(content: CvContent): CvCheck {
  const shown = content.sections.filter((section) => !section.hidden)
  let bullets = 0
  let withNumber = 0
  let weakStart = 0
  let long = 0
  const shapes = new Set<string>()
  const oddTitles: string[] = []
  const has = { experience: false, education: false, skills: false }

  for (const section of shown) {
    if (
      section.type === "experience" ||
      section.type === "education" ||
      section.type === "skills"
    ) {
      has[section.type] = true
      if (section.title.trim() && !STANDARD_TITLE[section.type].test(section.title))
        oddTitles.push(section.title.trim())
    }
    if (section.type !== "experience") continue
    for (const item of section.items) {
      const shape = dateShape(item.dates)
      if (shape) shapes.add(shape)
      for (const bullet of item.bullets) {
        const text = inlineToText(bullet).trim()
        if (!text) continue
        bullets += 1
        if (/\d/.test(text)) withNumber += 1
        if (WEAK_START.test(bulletBody(bullet))) weakStart += 1
        if (text.length > LONG_BULLET_CHARS) long += 1
      }
    }
  }

  const profile = shown.find((section) => section.type === "text")
  const profileText = profile?.type === "text" ? inlineToText(profile.body).trim() : ""
  return {
    bullets,
    withNumber,
    weakStart,
    long,
    profileWords: profileText ? profileText.split(/\s+/).length : null,
    email: /\S+@\S+\.\S+/.test(content.header.email),
    phone: /\d{3}/.test(content.header.phone),
    ...has,
    oddTitles,
    datesConsistent: shapes.size <= 1,
  }
}

export const AtsKeyword = z.object({
  term: z.string(),
  importance: z.enum(["required", "preferred"]),
  /** Lines of the CV that mention it */
  count: z.number(),
})
export type AtsKeyword = z.infer<typeof AtsKeyword>

export const AtsReport = z.object({
  keywords: z.array(AtsKeyword),
  /** Required keywords found, as a percent of required keywords (of all, when none is required) */
  score: z.number().nullable(),
  found: z.number(),
  total: z.number(),
  /** Keywords mentioned more often than KEYWORD_MOST */
  overused: z.array(z.string()),
  check: CvCheck,
})
export type AtsReport = z.infer<typeof AtsReport>

/**
 * The offer's keywords in the CV, after the skill's match score: (keywords matched / required
 * keywords) × 100, with a target of 80 or more. A term counts as found by stem, so "zarządzanie
 * zespołem" is found in "zarządzałem zespołem".
 */
export function atsReport(
  content: CvContent,
  keywords: { term: string; importance: "required" | "preferred" }[]
): AtsReport {
  const lines = cvPlainText(content)
    .split("\n")
    .filter((line) => line.trim())
  const counted = keywords.map((keyword) => ({
    term: keyword.term,
    importance: keyword.importance,
    count: lines.filter((line) => mentionsTerm(line, keyword.term)).length,
  }))
  const required = counted.filter((keyword) => keyword.importance === "required")
  const scored = required.length ? required : counted
  const found = scored.filter((keyword) => keyword.count > 0).length
  return {
    keywords: counted,
    score: scored.length ? Math.round((found / scored.length) * 100) : null,
    found,
    total: scored.length,
    overused: counted.filter((keyword) => keyword.count > KEYWORD_MOST).map((item) => item.term),
    check: checkCv(content),
  }
}
