import { z } from "zod"
import type { CvLocale } from "@newrole/cv-core/blank"
import { inlineToText } from "@newrole/cv-core/sanitize"
import type { CvContent } from "@newrole/cv-core/schema"
import { unverifiedNumbers, unverifiedTerms } from "@newrole/cv-core/tailor"
import { matchable, mentionsTerm } from "@newrole/cv-core/terms"
import { wrapUntrusted, type LlmClient } from "@newrole/llm/common"
import { humanStyle } from "@newrole/llm/human-style"
import type { LinkedInDocument } from "@newrole/profile/linkedin"

/**
 * The person's CV and their LinkedIn profile kept in step, after the "Resume-to-LinkedIn Sync"
 * of the linkedin-profile-optimizer skill (github.com/paramchoudhary/resumeskills at 74ae19e,
 * MIT; a copy is in newrole.it's .claude/skills): job titles, dates, core achievements and key
 * skills stay the same on both, while LinkedIn may say more, in a more conversational first
 * person, with the keywords of the whole field. Code compares the two; the model writes texts the
 * person pastes into LinkedIn themselves, from the CV and their profile only. Nothing is sent to
 * LinkedIn.
 */

/** The skill's limits: a headline of 220 characters, an About of 2,600, ~300 shown before "see more". */
export const LINKEDIN_LIMITS = { headline: 220, about: 2600, preview: 300 } as const

/** The skill's range for an About that uses the space, and the least a Skills section should list. */
export const ABOUT_RECOMMENDED = { min: 1500, max: 2000 } as const
export const SKILLS_LEAST = 5

export type RoleSync = {
  item: string
  company: string
  role: string
  dates: string
  /** The LinkedIn position at the same company; null when the profile has none */
  linkedIn: { title: string; subtitle: string } | null
  titleSame: boolean
  /** Every year the CV gives for the role is on LinkedIn too */
  yearsSame: boolean
}

export type LinkedInComparison = {
  roles: RoleSync[]
  /** Positions on LinkedIn at companies the CV does not list */
  onlyOnLinkedIn: { title: string; subtitle: string }[]
  /** Skills and technologies of the CV that LinkedIn's Skills section does not list */
  skillsMissing: string[]
  linkedInSkills: number
  headline: { cv: string; linkedIn: string | null }
  /** Characters of LinkedIn's About; null when the profile has none */
  aboutChars: number | null
}

const words = (text: string) => matchable(text).trim()

function partOf(block: LinkedInDocument["blocks"][number], field: "title" | "subtitle" | "body") {
  return block.parts.find((part) => part.field === field)?.text.trim() ?? ""
}

/** The roles the CV shows, newest first, as the editor keeps them. */
function cvRoles(cv: CvContent) {
  return cv.sections.flatMap((section) =>
    section.type === "experience" && !section.hidden
      ? section.items.filter((item) => item.company.trim() || item.role.trim())
      : []
  )
}

/** Skills and technologies the CV lists: its skills section and each role's "tech" line. */
export function cvSkillTerms(cv: CvContent): string[] {
  const raw: string[] = []
  for (const section of cv.sections) {
    if (section.hidden) continue
    if (section.type === "skills")
      for (const item of section.items) raw.push(...inlineToText(item.text).split(/[,;·•|]/))
    if (section.type === "experience")
      for (const item of section.items)
        raw.push(
          ...inlineToText(item.tech)
            .replace(/^[^:]{1,40}:\s*/, "")
            .split(/[,;·•|]/)
        )
  }
  const seen = new Set<string>()
  return raw
    .map((term) => term.replace(/\s+/g, " ").trim())
    .filter((term) => term.length >= 2 && term.length <= 40)
    .filter((term) => {
      const key = words(term)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
}

/** The CV against the LinkedIn profile the person keeps here, by code. */
export function compareWithLinkedIn(cv: CvContent, document: LinkedInDocument): LinkedInComparison {
  const positions = document.blocks
    .filter((block) => block.kind === "experience")
    .map((block) => ({ title: partOf(block, "title"), subtitle: partOf(block, "subtitle") }))
  const used = new Set<number>()
  const roles = cvRoles(cv).map((item): RoleSync => {
    const company = words(item.company)
    const index = positions.findIndex(
      (position, at) =>
        !used.has(at) &&
        company.length > 1 &&
        (words(position.subtitle).includes(company) ||
          (words(position.subtitle.split(" · ")[0] ?? "").length > 1 &&
            company.includes(words(position.subtitle.split(" · ")[0]))))
    )
    const linkedIn = index >= 0 ? positions[index] : null
    if (index >= 0) used.add(index)
    const role = words(item.role)
    const title = linkedIn ? words(linkedIn.title) : ""
    const years = item.dates.match(/\b(?:19|20)\d{2}\b/g) ?? []
    return {
      item: item.id,
      company: item.company.trim(),
      role: item.role.trim(),
      dates: item.dates.trim(),
      linkedIn,
      titleSame: Boolean(linkedIn && role && (title.includes(role) || role.includes(title))),
      yearsSame: Boolean(linkedIn && years.every((year) => linkedIn.subtitle.includes(year))),
    }
  })

  const skillsBlock = document.blocks.find((block) => block.kind === "skills")
  const skillsText = skillsBlock ? partOf(skillsBlock, "body") || partOf(skillsBlock, "title") : ""
  const linkedInSkills = skillsText ? skillsText.split(" · ").filter(Boolean).length : 0
  const headline = document.blocks.find((block) => block.kind === "headline")
  const about = document.blocks.find((block) => block.kind === "about")
  const aboutText = about ? about.parts.map((part) => part.text).join("\n") : ""
  return {
    roles,
    onlyOnLinkedIn: positions.filter((_, at) => !used.has(at)),
    skillsMissing: cvSkillTerms(cv)
      .filter((term) => !skillsText || !mentionsTerm(skillsText, term))
      .slice(0, 30),
    linkedInSkills,
    headline: {
      cv: cv.header.headline.trim(),
      linkedIn: headline
        ? headline.parts
            .map((part) => part.text)
            .join(" ")
            .trim() || null
        : null,
    },
    aboutChars: aboutText.trim() ? aboutText.trim().length : null,
  }
}

/* ---------------------------------------------------------------- texts to paste */

export const LinkedInTextsReply = z.object({
  headline: z.string().max(600).catch(""),
  about: z.string().max(6000).catch(""),
  roles: z
    .array(
      z.object({
        item: z.string().max(64),
        description: z.string().max(2000).catch(""),
        bullets: z.array(z.string().max(800)).max(10).catch([]),
      })
    )
    .max(40)
    .catch([]),
  skills: z.array(z.string().max(120)).max(80).catch([]),
})
export type LinkedInTextsReply = z.infer<typeof LinkedInTextsReply>

export type LinkedInTexts = {
  language: CvLocale
  headline: string
  about: string
  roles: { item: string; company: string; role: string; description: string; bullets: string[] }[]
  skills: string[]
  /** Names in the texts that the person's data does not have, for them to check */
  unverified: string[]
  /** Pieces left out because they added a number the data does not have */
  dropped: number
}

const LINKEDIN_SYSTEM = `You write the texts of a person's LinkedIn profile from their CV and their own profile, for them to paste into LinkedIn themselves (after the linkedin-profile-optimizer skill).

Truth comes first:
- Use only facts in the CV and the candidate context. Never add employers, titles, dates, numbers, metrics, technologies, certificates, education, languages, clients or results they do not state. Keep every number exactly as written.
- The skill's sync rule: job titles, dates, core achievements and key skills stay as the CV has them. LinkedIn may give more context, in a more conversational first person, with the keywords of the person's whole field rather than of one offer.
- In Polish, use the grammatical gender the CV's own verbs use ("prowadziłem" or "prowadziłam"). Never infer it from the name. When the CV shows none, write sentences that need no gendered form.

What to write:
- "headline": at most 220 characters, shaped as role | key expertise | what they bring, with the terms recruiters search for in their field. Only a role they hold or have held. Never "Looking for opportunities" or "Open to work".
- "about": first person, 3 to 5 short paragraphs of plain text with a blank line between them, at most 2600 characters. Only the first 300 characters show before "see more", so open with who they are and their strongest fact. Then what they do, their main achievements and specialties from the CV, what they look for next only as far as the context says, and a last line listing their key skills. Write as much as the facts carry: shorter is fine, never pad.
- "roles": for each role id given, "description": 2 or 3 first-person sentences on the role (the product, the team, the scope), and "bullets": up to 6 achievements from that role's bullets, reworded for LinkedIn where it helps, each keeping its facts. Write them as the CV does: first person with a verb, past tense for earlier roles and present for the current one, never a list of nouns.
- "skills": up to 30 skills for the Skills section, most important first, each one the CV or the context shows: tools, methods, domains, and soft skills the CV shows in action.
No emoji, arrows or hashtags. No markdown.`

const LINKEDIN_FORMAT = `Return JSON:
{"headline":"...","about":"...","roles":[{"item":"<role id>","description":"...","bullets":["..."]}],"skills":["..."]}`

const LANGUAGE_NAME: Record<CvLocale, string> = { pl: "Polish", en: "English" }

const clean = (text: string) =>
  inlineToText(text)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/**
 * The LinkedIn texts for the person's CV. A piece that adds a number the data does not have is
 * left out (a paragraph, a bullet, the headline), and a skill the data does not show is dropped.
 * Null when the model gives nothing usable.
 */
export async function writeLinkedInTexts(input: {
  llm: LlmClient
  cv: CvContent
  context: string
  /** The language of the texts: the LinkedIn profile's, else the CV's */
  language: CvLocale
  /** The profile as LinkedIn has it now, when the person keeps it here */
  current?: string
  userId?: number
}): Promise<LinkedInTexts | null> {
  const { llm, cv, context, language } = input
  const roles = cvRoles(cv).map((item) => ({
    item: item.id,
    company: item.company,
    role: item.role,
    dates: item.dates,
    summary: inlineToText(item.summary),
    bullets: item.bullets.map((bullet) => inlineToText(bullet)),
    tech: inlineToText(item.tech),
  }))
  const cvText = JSON.stringify({ headline: cv.header.headline, roles })
  const reply = await llm.completeJson({
    purpose: "linkedin-sync",
    system: [LINKEDIN_SYSTEM, humanStyle([language]), LINKEDIN_FORMAT].join("\n\n"),
    user: [
      `Write in: ${LANGUAGE_NAME[language]}`,
      "",
      "Candidate context (the candidate's own profile and CV):",
      `<candidate_context>\n${context || "(empty)"}\n</candidate_context>`,
      "",
      "The CV's headline and roles:",
      `<cv>\n${cvText}\n</cv>`,
      ...(input.current
        ? ["", "Their LinkedIn profile now:", wrapUntrusted("linkedin", input.current)]
        : []),
    ].join("\n"),
    schema: LinkedInTextsReply as unknown as z.ZodType<LinkedInTextsReply>,
    maxTokens: 5000,
    timeoutMs: 150_000,
    userId: input.userId,
  })
  if (!reply?.data) return null

  const evidence = `${context}\n${cvText}\n${input.current ?? ""}`
  let dropped = 0
  const backed = (text: string) => {
    if (!text) return ""
    if (unverifiedNumbers([text], evidence).length) {
      dropped += 1
      return ""
    }
    return text
  }
  let headline = backed(clean(reply.data.headline).replace(/\s*\n\s*/g, " "))
  if (headline.length > LINKEDIN_LIMITS.headline) {
    // cut at the last separator that fits, never inside a word
    const cut = headline.slice(0, LINKEDIN_LIMITS.headline)
    const at = Math.max(cut.lastIndexOf(" | "), cut.lastIndexOf(" · "))
    headline = at > 40 ? cut.slice(0, at) : cut.slice(0, cut.lastIndexOf(" "))
  }
  const paragraphs = clean(reply.data.about)
    .split(/\n\s*\n/)
    .map((paragraph) => backed(paragraph.trim()))
    .filter(Boolean)
  const about: string[] = []
  for (const paragraph of paragraphs) {
    if ([...about, paragraph].join("\n\n").length > LINKEDIN_LIMITS.about) break
    about.push(paragraph)
  }
  const byId = new Map(reply.data.roles.map((role) => [role.item, role]))
  const written = roles.flatMap((role) => {
    const proposal = byId.get(role.item)
    if (!proposal) return []
    const description = backed(clean(proposal.description))
    const bullets = proposal.bullets.map((bullet) => backed(clean(bullet))).filter(Boolean)
    if (!description && !bullets.length) return []
    return [{ item: role.item, company: role.company, role: role.role, description, bullets }]
  })
  const skills = [
    ...new Map(
      reply.data.skills
        .map((skill) => clean(skill))
        .filter((skill) => skill.length >= 2 && skill.length <= 60 && mentionsTerm(evidence, skill))
        .map((skill) => [words(skill), skill])
    ).values(),
  ].slice(0, 30)
  const texts = [
    headline,
    ...about,
    ...written.flatMap((role) => [role.description, ...role.bullets]),
  ]
  if (!texts.some(Boolean)) return null
  return {
    language,
    headline,
    about: about.join("\n\n"),
    roles: written,
    skills,
    unverified: unverifiedTerms(texts.filter(Boolean), evidence).slice(0, 12),
    dropped,
  }
}
