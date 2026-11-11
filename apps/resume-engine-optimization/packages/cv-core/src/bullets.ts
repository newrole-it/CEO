import { z } from "zod"
import { inlineToText } from "./sanitize"
import type { CvContent } from "./schema"

/**
 * The bullet check after tailoring, after the resume-bullet-writer and resume-quantifier skills
 * (github.com/paramchoudhary/resumeskills at 74ae19e, MIT; copies are in newrole.it's
 * .claude/skills). The model names what is weak in a bullet and may propose a stronger one from
 * the same facts; where only a number would help, it asks the person instead of estimating one,
 * because a number nobody gave is a fact made up.
 */

export const BULLET_ISSUES = [
  "weak-verb",
  "duty",
  "vague",
  "no-result",
  "too-long",
  "no-number",
] as const
export const BulletIssue = z.enum(BULLET_ISSUES)
export type BulletIssue = z.infer<typeof BulletIssue>

export const BulletReply = z.object({
  bullets: z
    .array(
      z.object({
        item: z.string().max(64),
        index: z.number().int().min(0).max(80),
        issues: z.array(BulletIssue.catch("vague")).max(8).catch([]),
        rewrite: z.string().max(2000).optional().catch(undefined),
        question: z.string().max(400).optional().catch(undefined),
      })
    )
    .max(160)
    .catch([]),
})
export type BulletReply = z.infer<typeof BulletReply>

/** A question for the person about one bullet, so they can add a number they know. */
export const BulletQuestion = z.object({
  company: z.string(),
  role: z.string(),
  bullet: z.string(),
  question: z.string(),
})
export type BulletQuestion = z.infer<typeof BulletQuestion>

export const BulletReport = z.object({
  /** Bullets the model was shown */
  checked: z.number(),
  /** Bullets it found something weak in */
  flagged: z.number(),
  rewritten: z.number(),
  /** Rewrites refused because they added a number the data does not have */
  reverted: z.number(),
  /** How many bullets had each issue */
  issues: z.record(z.string(), z.number()),
  questions: z.array(BulletQuestion),
})
export type BulletReport = z.infer<typeof BulletReport>

/** Recent roles carry the CV; older ones get a line or nothing, so their bullets are not checked. */
export const CHECKED_ROLES = 4
const MAX_QUESTIONS = 8

/** The bullets the check reads: those of the first roles shown, with their ids and positions. */
export function bulletsForModel(content: CvContent) {
  const roles: {
    item: string
    company: string
    role: string
    bullets: { index: number; text: string }[]
  }[] = []
  for (const section of content.sections) {
    if (section.type !== "experience" || section.hidden) continue
    for (const item of section.items) {
      const bullets = item.bullets
        .map((bullet, index) => ({ index, text: bullet }))
        .filter((bullet) => inlineToText(bullet.text).trim())
      if (bullets.length)
        roles.push({ item: item.id, company: item.company, role: item.role, bullets })
      if (roles.length === CHECKED_ROLES) return roles
    }
  }
  return roles
}

/** What the check found and did, with questions only for bullets it was shown. */
export function bulletReport(
  content: CvContent,
  reply: BulletReply,
  done: { rewritten: number; reverted: number }
): BulletReport {
  const roles = bulletsForModel(content)
  const shown = new Map<
    string,
    { role: (typeof roles)[number]; bullet: { index: number; text: string } }
  >(
    roles.flatMap((role) =>
      role.bullets.map(
        (bullet) => [`${role.item}:${bullet.index}` as string, { role, bullet }] as const
      )
    )
  )
  const issues: Record<string, number> = {}
  const questions: BulletQuestion[] = []
  const seen = new Set<string>()
  let flagged = 0
  for (const entry of reply.bullets) {
    const key = `${entry.item}:${entry.index}`
    const found = shown.get(key)
    if (!found || seen.has(key)) continue
    seen.add(key)
    if (entry.issues.length) flagged += 1
    for (const issue of new Set(entry.issues)) issues[issue] = (issues[issue] ?? 0) + 1
    const question = entry.question?.replace(/\s+/g, " ").trim()
    // the same question about the same words in another role says nothing new
    const repeated = questions.some(
      (item) =>
        item.question === question ||
        item.bullet === inlineToText(found.bullet.text).trim().slice(0, 200)
    )
    if (question && !repeated && questions.length < MAX_QUESTIONS) {
      questions.push({
        company: found.role.company,
        role: found.role.role,
        bullet: inlineToText(found.bullet.text).trim().slice(0, 200),
        question: question.slice(0, 300),
      })
    }
  }
  return {
    checked: shown.size,
    flagged,
    rewritten: done.rewritten,
    reverted: done.reverted,
    issues,
    questions,
  }
}
