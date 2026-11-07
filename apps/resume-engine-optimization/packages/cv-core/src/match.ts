import { z } from "zod"
import { AtsReport, CvCheck } from "./ats"
import { BulletReport } from "./bullets"
import { StepUpdate } from "./progress"
import { inlineToText } from "./sanitize"
import { mentionsTerm, quoteIn } from "./terms"

/**
 * One offer read before a CV is matched to it, and the person's data checked against it, after
 * the job-description-analyzer skill (github.com/paramchoudhary/resumeskills at 74ae19e, MIT; a
 * copy is in newrole.it's .claude/skills). The model reads; code decides what stands: a keyword
 * or a red flag the offer does not contain is dropped, evidence the person's data does not
 * contain does not count, and the score is the skill's formula over what is left, never a number
 * the model gives.
 */

export const RequirementImportance = z.enum(["required", "preferred", "soft"])
export type RequirementImportance = z.infer<typeof RequirementImportance>

export const RequirementKind = z.enum([
  "skill",
  "tool",
  "experience",
  "education",
  "certification",
  "language",
  "domain",
  "soft",
])
export type RequirementKind = z.infer<typeof RequirementKind>

/** hard: tools, technologies, methods, certifications; domain: industry and its rules; soft */
export const KeywordType = z.enum(["hard", "domain", "soft"])
export type KeywordType = z.infer<typeof KeywordType>

const KeywordImportance = z.enum(["required", "preferred"])

/* ---------------------------------------------------------------- the offer */

export const OfferAnalysisReply = z.object({
  role: z.string().max(600).catch(""),
  seniority: z.string().max(200).catch(""),
  requirements: z
    .array(
      z.object({
        text: z.string().max(600),
        importance: RequirementImportance.catch("preferred"),
        kind: RequirementKind.catch("skill"),
        keyword: z.string().max(200).optional().catch(undefined),
      })
    )
    .max(80)
    .catch([]),
  keywords: z
    .array(
      z.object({
        term: z.string().max(200),
        type: KeywordType.catch("hard"),
        importance: KeywordImportance.catch("preferred"),
      })
    )
    .max(60)
    .catch([]),
  responsibilities: z.array(z.string().max(600)).max(20).catch([]),
  redFlags: z
    .array(z.object({ quote: z.string().max(400), why: z.string().max(600) }))
    .max(12)
    .catch([]),
  signals: z.array(z.string().max(600)).max(12).catch([]),
})
export type OfferAnalysisReply = z.infer<typeof OfferAnalysisReply>

export const OfferRequirement = z.object({
  id: z.string(),
  text: z.string(),
  importance: RequirementImportance,
  kind: RequirementKind,
  keyword: z.string().optional(),
})
export type OfferRequirement = z.infer<typeof OfferRequirement>

export const OfferKeyword = z.object({
  term: z.string(),
  type: KeywordType,
  importance: KeywordImportance,
})
export type OfferKeyword = z.infer<typeof OfferKeyword>

export const OfferAnalysis = z.object({
  /** One sentence on what the role is, in the language of the notes */
  role: z.string(),
  /** As the offer states it, or "" */
  seniority: z.string(),
  /** Required first, then preferred, then soft */
  requirements: z.array(OfferRequirement),
  /** What an ATS and a recruiter search the CV for, most important first, as the offer writes them */
  keywords: z.array(OfferKeyword),
  responsibilities: z.array(z.string()),
  /** Warning signs the skill lists, each quoting the offer */
  redFlags: z.array(z.object({ quote: z.string(), why: z.string() })),
  /** What the offer shows that is good to know: a pay range, named tools, a clear process */
  signals: z.array(z.string()),
})
export type OfferAnalysis = z.infer<typeof OfferAnalysis>

const LIMIT = { requirements: 30, keywords: 15, responsibilities: 6, redFlags: 5, signals: 4 }
const ORDER: RequirementImportance[] = ["required", "preferred", "soft"]

const line = (text: string | undefined, max: number) =>
  inlineToText(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const value = key(item).toLowerCase()
    if (!value || seen.has(value)) return false
    seen.add(value)
    return true
  })
}

/**
 * The model's reading of the offer, kept to what the offer's text shows: a keyword or a red flag
 * whose words are not in it is dropped. Null when no requirement is left.
 */
export function cleanOfferAnalysis(
  reply: OfferAnalysisReply,
  offerText: string
): OfferAnalysis | null {
  const inOffer = (term: string) => mentionsTerm(offerText, term)
  const requirements = unique(
    reply.requirements.map((item) => {
      const keyword = line(item.keyword, 80)
      return {
        text: line(item.text, 200),
        importance: item.importance,
        kind: item.importance === "soft" ? ("soft" as const) : item.kind,
        keyword: keyword && inOffer(keyword) ? keyword : undefined,
      }
    }),
    (item) => item.text
  )
    .sort((a, b) => ORDER.indexOf(a.importance) - ORDER.indexOf(b.importance))
    .slice(0, LIMIT.requirements)
    .map((item, index) => ({ id: `r${index + 1}`, ...item }))
  if (!requirements.length) return null

  const keywords = unique(
    reply.keywords
      .map((item) => ({ ...item, term: line(item.term, 80) }))
      .filter((item) => item.term && inOffer(item.term)),
    (item) => item.term
  )
    // required ones first, the model's order kept within each
    .sort((a, b) => Number(a.importance !== "required") - Number(b.importance !== "required"))
    .slice(0, LIMIT.keywords)

  return {
    role: line(reply.role, 300),
    seniority: line(reply.seniority, 60),
    requirements,
    keywords,
    responsibilities: unique(
      reply.responsibilities.map((item) => line(item, 240)),
      (item) => item
    ).slice(0, LIMIT.responsibilities),
    redFlags: unique(
      reply.redFlags
        .map((flag) => ({ quote: line(flag.quote, 160), why: line(flag.why, 240) }))
        .filter((flag) => flag.quote && flag.why && quoteIn(offerText, flag.quote)),
      (flag) => flag.quote
    ).slice(0, LIMIT.redFlags),
    signals: unique(
      reply.signals.map((item) => line(item, 240)),
      (item) => item
    ).slice(0, LIMIT.signals),
  }
}

/* ---------------------------------------------------------------- the match */

export const MatchStatus = z.enum(["met", "partial", "missing"])
export type MatchStatus = z.infer<typeof MatchStatus>

/** critical: a deal-breaker; major: real but addressable; minor: easy to learn, or a plus */
export const GapLevel = z.enum(["critical", "major", "minor"])
export type GapLevel = z.infer<typeof GapLevel>

export const MatchReply = z.object({
  requirements: z
    .array(
      z.object({
        id: z.string().max(16),
        status: MatchStatus.catch("missing"),
        evidence: z.string().max(800).optional().catch(undefined),
        gap: GapLevel.optional().catch(undefined),
        note: z.string().max(600).optional().catch(undefined),
      })
    )
    .max(80)
    .catch([]),
  strengths: z
    .array(
      z.object({
        title: z.string().max(300),
        why: z.string().max(600),
        evidence: z.string().max(800).optional().catch(undefined),
      })
    )
    .max(6)
    .catch([]),
  emphasize: z.array(z.string().max(600)).max(8).catch([]),
  talkingPoints: z.array(z.string().max(600)).max(6).catch([]),
})
export type MatchReply = z.infer<typeof MatchReply>

export const MatchedRequirement = OfferRequirement.extend({
  status: MatchStatus,
  /** Copied from the person's data and found there; "" when nothing shows it */
  evidence: z.string(),
  gap: GapLevel.nullable(),
  note: z.string(),
})
export type MatchedRequirement = z.infer<typeof MatchedRequirement>

export const GroupScore = z.object({
  met: z.number(),
  partial: z.number(),
  total: z.number(),
  /** (met + half of partial) / total, as a percent; null when the offer lists none */
  percent: z.number().nullable(),
})
export type GroupScore = z.infer<typeof GroupScore>

/**
 * The skill's reading of a score: 90 to 100 meets nearly everything (the skill warns the role may
 * sit below the person's level), 75 to 89 an excellent fit, 60 to 74 a good fit, 50 to 59 a
 * stretch, under 50 under-qualified.
 */
export const MatchBand = z.enum(["top", "excellent", "good", "stretch", "under"])
export type MatchBand = z.infer<typeof MatchBand>

export const MatchReport = z.object({
  /** Required 70 %, preferred 30 % (the skill's weights); null when the offer lists neither */
  score: z.number().nullable(),
  band: MatchBand.nullable(),
  groups: z.object({ required: GroupScore, preferred: GroupScore, soft: GroupScore }),
  requirements: z.array(MatchedRequirement),
  strengths: z.array(z.object({ title: z.string(), why: z.string(), evidence: z.string() })),
  /** What to lead with in this CV, in the language of the notes */
  emphasize: z.array(z.string()),
  /** Points for the cover letter, each tied to a fact */
  talkingPoints: z.array(z.string()),
  /** Requirements missing at the critical level */
  critical: z.number(),
})
export type MatchReport = z.infer<typeof MatchReport>

export const WEIGHT = { required: 0.7, preferred: 0.3 }

export function bandOf(score: number): MatchBand {
  if (score >= 90) return "top"
  if (score >= 75) return "excellent"
  if (score >= 60) return "good"
  if (score >= 50) return "stretch"
  return "under"
}

function group(requirements: MatchedRequirement[], importance: RequirementImportance): GroupScore {
  const own = requirements.filter((item) => item.importance === importance)
  const met = own.filter((item) => item.status === "met").length
  const partial = own.filter((item) => item.status === "partial").length
  return {
    met,
    partial,
    total: own.length,
    percent: own.length ? Math.round(((met + partial / 2) / own.length) * 100) : null,
  }
}

/** The skill's formula: required × 0.7 + preferred × 0.3, either alone when the other is absent. */
export function matchScore(groups: MatchReport["groups"]): number | null {
  const { required, preferred } = groups
  if (required.percent == null) return preferred.percent
  if (preferred.percent == null) return required.percent
  return Math.round(required.percent * WEIGHT.required + preferred.percent * WEIGHT.preferred)
}

/**
 * The model's check of each requirement, kept to what the person's data shows. "met" whose
 * evidence is not found in `evidence` counts as partial, and "partial" without it as missing: a
 * claim nobody can point to does not raise the score. A strength without found evidence is
 * dropped. Null when the reply covers no requirement.
 */
export function buildMatchReport(
  analysis: OfferAnalysis,
  reply: MatchReply,
  evidence: string
): MatchReport | null {
  const byId = new Map(reply.requirements.map((item) => [item.id.trim(), item]))
  if (!analysis.requirements.some((item) => byId.has(item.id))) return null
  const found = (quote: string | undefined) => {
    const text = line(quote, 300)
    return text && quoteIn(evidence, text) ? text : ""
  }

  const requirements = analysis.requirements.map((item): MatchedRequirement => {
    const answer = byId.get(item.id)
    const quote = found(answer?.evidence)
    let status: MatchStatus = answer?.status ?? "missing"
    if (!quote) status = status === "met" ? "partial" : "missing"
    const gap =
      status === "met" ? null : answer?.gap ?? (item.importance === "required" ? "major" : "minor")
    return {
      ...item,
      status,
      evidence: status === "missing" ? "" : quote,
      gap,
      note: line(answer?.note, 300),
    }
  })

  const groups = {
    required: group(requirements, "required"),
    preferred: group(requirements, "preferred"),
    soft: group(requirements, "soft"),
  }
  const score = matchScore(groups)
  return {
    score,
    band: score == null ? null : bandOf(score),
    groups,
    requirements,
    strengths: reply.strengths
      .map((item) => ({
        title: line(item.title, 120),
        why: line(item.why, 300),
        evidence: found(item.evidence),
      }))
      .filter((item) => item.title && item.evidence)
      .slice(0, 3),
    emphasize: reply.emphasize
      .map((item) => line(item, 300))
      .filter(Boolean)
      .slice(0, 4),
    talkingPoints: reply.talkingPoints
      .map((item) => line(item, 300))
      .filter(Boolean)
      .slice(0, 3),
    critical: requirements.filter((item) => item.status === "missing" && item.gap === "critical")
      .length,
  }
}

/* ---------------------------------------------------------------- comments on a round */

/**
 * What a comment is on: a requirement (by its id), a keyword, a bullet the bullet check asked
 * about, or a name or number the facts check could not find in the person's data.
 */
export const MatchCommentKind = z.enum(["requirement", "keyword", "question", "unverified"])
export type MatchCommentKind = z.infer<typeof MatchCommentKind>

export const COMMENT_MAX = 2000

export const MatchComment = z.object({
  kind: MatchCommentKind,
  /** The point within its kind: a requirement's id, the keyword, the bullet, the term */
  key: z.string().min(1).max(600),
  /** The point as the round showed it, so the next round and the profile know what it answers */
  subject: z.string().max(600),
  text: z.string().min(1).max(COMMENT_MAX),
  at: z.string(),
})
export type MatchComment = z.infer<typeof MatchComment>

/** A round's comments as stored; one that no longer parses is dropped, not the others. */
export function parseMatchComments(value: unknown): MatchComment[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const parsed = MatchComment.safeParse(item)
    return parsed.success ? [parsed.data] : []
  })
}

export const commentId = (comment: Pick<MatchComment, "kind" | "key">) =>
  `${comment.kind}:${comment.key}`

/**
 * The comments with this one put in, in place of an earlier one on the same point; empty text
 * takes the point's comment out.
 */
export function withComment(
  comments: MatchComment[],
  next: Omit<MatchComment, "text"> & { text: string }
): MatchComment[] {
  const id = commentId(next)
  const text = next.text.trim().slice(0, COMMENT_MAX)
  const others = comments.filter((item) => commentId(item) !== id)
  return text ? [...others, { ...next, text }] : others
}

const COMMENT_LABEL: Record<MatchCommentKind, string> = {
  requirement: "Requirement",
  keyword: "Keyword",
  question: "Bullet the check asked about",
  unverified: "Name or number the check could not find in the candidate's data",
}

/**
 * The person's comments on the last round, for the model that writes the next one: what each
 * comment answers, and what the round found there. In English; the comments stay as written.
 */
export function commentsForModel(comments: MatchComment[], notes: MatchNotes | null): string {
  const requirements = new Map(
    (notes?.report?.requirements ?? []).map((item) => [item.id, item] as const)
  )
  const found = new Map((notes?.ats.after.keywords ?? []).map((item) => [item.term, item.count]))
  return comments
    .map((comment) => {
      const requirement = comment.kind === "requirement" ? requirements.get(comment.key) : null
      const state = requirement
        ? ` (${requirement.importance}; ${requirement.status})`
        : comment.kind === "keyword" && found.has(comment.key)
        ? found.get(comment.key)
          ? ` (in the CV ${found.get(comment.key)}×)`
          : " (not in the CV)"
        : ""
      const subject = line(comment.subject || comment.key, 300)
      return `- ${COMMENT_LABEL[comment.kind]}${state}: ${subject}\n  Comment: ${line(
        comment.text,
        COMMENT_MAX
      )}`
    })
    .join("\n")
}

/* ---------------------------------------------------------------- stored with the CV */

/** Everything the match dashboard shows for one CV tailored to an offer. */
export const MatchNotes = z.object({
  /** Null when the offer had no text to analyse */
  analysis: OfferAnalysis.nullable(),
  /** Null when there was no analysis or the match step failed */
  report: MatchReport.nullable(),
  cv: z.object({ before: CvCheck, after: CvCheck }),
  /** The offer's keywords in the CV before and after tailoring */
  ats: z.object({ before: AtsReport, after: AtsReport }),
  /** Null when the bullet check did not run or failed */
  bullets: BulletReport.nullable(),
  /** What ran, with what each step found */
  steps: z.array(StepUpdate),
})
export type MatchNotes = z.infer<typeof MatchNotes>
