import { z } from "zod"
import {
  GapLevel,
  MatchStatus,
  RequirementImportance,
  type MatchReport,
  type OfferAnalysis,
  type OfferRequirement,
  type RequirementKind,
} from "./match"
import { inlineToText } from "./sanitize"
import { STORY_PARTS, storyBody, unbackedFigures, type StoryFields } from "./stories"
import { unverifiedNumbers, unverifiedTerms } from "./tailor"
import { hasTerm, matchable, quoteIn } from "./terms"

/**
 * Interview preparation for one offer, put together by code from what is already known: the
 * offer's requirements (its analysis), the match of the person's CV with them, the story bank and
 * the offer's own text. The structure follows career-ops' modes/interview-prep.md (questions per
 * audience, story mapping with strong / partial / none, questions to ask back) and block F of
 * modes/oferta.md (MIT); none of its text is used.
 *
 * A model may word the questions, point a story at a requirement and suggest a line for a gap.
 * Code decides what stands:
 * - a question is tied to a requirement of the offer by its id, or it is one of the fixed general
 *   ones; nothing is ever presented as a question the company is known to ask,
 * - a story answers a requirement only when the fragment the model copied is in that story,
 * - a line for a gap may not use a number or a tool name the person's data and the offer lack,
 * - a question to ask them rests on a fragment found in the offer's text.
 * Without a model everything here still comes out, from rules alone.
 */

/** Who asks: the recruiter's screen, the hiring manager, the technical or peer round. */
export const Audience = z.enum(["recruiter", "manager", "peer"])
export type Audience = z.infer<typeof Audience>
export const AUDIENCES: Audience[] = ["recruiter", "manager", "peer"]

/** The general questions, the same for every offer. The interface has their words. */
export const GENERAL_QUESTIONS = {
  recruiter: ["walk-through", "why-looking", "salary", "availability", "work-mode"],
  manager: ["why-role", "proud", "conflict", "failure"],
  peer: ["hard-problem", "trade-off", "feedback"],
} as const satisfies Record<Audience, readonly string[]>

export const GeneralQuestion = z.enum([
  ...GENERAL_QUESTIONS.recruiter,
  ...GENERAL_QUESTIONS.manager,
  ...GENERAL_QUESTIONS.peer,
])
export type GeneralQuestion = z.infer<typeof GeneralQuestion>

export const StoryFit = z.enum(["strong", "partial", "none"])
export type StoryFit = z.infer<typeof StoryFit>

export const PrepQuestion = z.object({
  id: z.string(),
  audience: Audience,
  /** The model's wording; null when the interface words it from `basis` */
  text: z.string().nullable(),
  basis: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("requirement"),
      requirementId: z.string(),
      /** The requirement as the offer states it */
      requirement: z.string(),
      importance: RequirementImportance,
    }),
    z.object({ kind: z.literal("general"), question: GeneralQuestion }),
  ]),
  /** The saved story that answers it best; null when none does */
  storyId: z.string().nullable(),
})
export type PrepQuestion = z.infer<typeof PrepQuestion>

export const StoryMapping = z.object({
  requirementId: z.string(),
  requirement: z.string(),
  importance: RequirementImportance,
  storyId: z.string().nullable(),
  fit: StoryFit,
  /** The fragment of the story that answers the requirement, found in it; "" for a match by words */
  evidence: z.string(),
  /** model: the model pointed at the story and its fragment was found; rules: matched by words */
  by: z.enum(["model", "rules"]),
  /** Numbers in that story the person's CV and profile do not have */
  unbacked: z.array(z.string()),
  /** For a requirement with no story: what the match found in the CV, a start for one */
  lead: z.string(),
})
export type StoryMapping = z.infer<typeof StoryMapping>

export const PrepRisk = z.object({
  requirementId: z.string(),
  requirement: z.string(),
  status: MatchStatus,
  gap: GapLevel.nullable(),
  /** What the person's data does show, when it is partial */
  evidence: z.string(),
  /** An honest line for it; "" when there is none and the interface gives its fixed one */
  line: z.string(),
  by: z.enum(["model", "match", "none"]),
})
export type PrepRisk = z.infer<typeof PrepRisk>

/** What the offer's data leaves open. */
export const UnknownTopic = z.enum(["salary", "work-mode", "contract"])
export type UnknownTopic = z.infer<typeof UnknownTopic>

export const GENERAL_ASKS = ["process", "success", "team"] as const
export const GeneralAsk = z.enum(GENERAL_ASKS)
export type GeneralAsk = z.infer<typeof GeneralAsk>

export const PrepAsk = z.object({
  id: z.string(),
  /** The model's wording; null when the interface words it from `basis` */
  text: z.string().nullable(),
  basis: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("red-flag"), quote: z.string(), why: z.string() }),
    z.object({ kind: z.literal("offer"), quote: z.string() }),
    z.object({ kind: z.literal("unknown"), topic: UnknownTopic }),
    z.object({ kind: z.literal("general"), ask: GeneralAsk }),
  ]),
})
export type PrepAsk = z.infer<typeof PrepAsk>

/** What was not there when the preparation was made, so a part of it is empty or thinner. */
export const PrepGap = z.enum(["offer-text", "requirements", "match", "stories", "cv", "model"])
export type PrepGap = z.infer<typeof PrepGap>

export const InterviewPrepContent = z.object({
  version: z.literal(1),
  /** llm: a model worded and mapped, and code checked it; rules: code alone */
  reader: z.enum(["llm", "rules"]),
  questions: z.array(PrepQuestion),
  mapping: z.array(StoryMapping),
  /** Null when there is no match to read them from: unknown, not "none" */
  risks: z.array(PrepRisk).nullable(),
  asks: z.array(PrepAsk),
  /** The saved stories at that moment, so the page can name them later */
  stories: z.array(z.object({ id: z.string(), title: z.string() })),
  basis: z.object({
    /** round: the newest round of the CV written for the offer; fresh: checked just for this */
    match: z.enum(["round", "fresh", "none"]),
    matchRound: z.number().nullable(),
    score: z.number().nullable(),
    requirements: z.number(),
  }),
  missing: z.array(PrepGap),
})
export type InterviewPrepContent = z.infer<typeof InterviewPrepContent>

export function parseInterviewPrep(value: unknown): InterviewPrepContent | null {
  const parsed = InterviewPrepContent.safeParse(value)
  return parsed.success ? parsed.data : null
}

/* ---------------------------------------------------------------- the model's part */

export const PrepReply = z.object({
  questions: z
    .array(
      z.object({
        requirementId: z.string().max(16),
        audience: Audience.optional().catch(undefined),
        text: z.string().max(600),
      })
    )
    .max(60)
    .catch([]),
  mapping: z
    .array(
      z.object({
        requirementId: z.string().max(16),
        storyId: z.string().max(64),
        fit: StoryFit.catch("partial"),
        evidence: z.string().max(800).optional().catch(undefined),
      })
    )
    .max(80)
    .catch([]),
  risks: z
    .array(z.object({ requirementId: z.string().max(16), line: z.string().max(800) }))
    .max(40)
    .catch([]),
  asks: z
    .array(z.object({ text: z.string().max(600), quote: z.string().max(400) }))
    .max(20)
    .catch([]),
})
export type PrepReply = z.infer<typeof PrepReply>

/* ---------------------------------------------------------------- rules */

export type PrepStory = StoryFields & { id: string }

/** What the offer's own record says, next to its text. */
export type OfferFacts = {
  hasSalary: boolean
  hasWorkMode: boolean
  hasContract: boolean
}

const LIMIT = { requirements: 14, perAudience: 7, asks: 8, modelAsks: 4 }
const ORDER: RequirementImportance[] = ["required", "preferred", "soft"]

const line = (text: string | undefined, max: number) =>
  inlineToText(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

/** Polish forms of address written with a capital inside a sentence: not names. */
const POLITE =
  /^(?:Ty|Ci|Cię|Ciebie|Tobie|Tobą|Twój|Twoj\p{L}*|Twoi\p{L}*|Wy|Was|Wam|Wami|Wasz\p{L}*|Pan|Pani|Pana|Panu|Panem|Panią|Państw\p{L}*)$/u

/** Who would ask about a requirement of this kind, when no model says otherwise. */
export function audienceOf(kind: RequirementKind): Audience {
  if (kind === "language" || kind === "education" || kind === "certification") return "recruiter"
  if (kind === "soft" || kind === "experience") return "manager"
  return "peer"
}

const PAY =
  /\d[\d\s.,]*\s*(?:pln|zł|zl|eur|€|usd|\$|gbp|£|chf)|(?:pln|eur|€|usd|\$|gbp|£|chf)\s*\d/i
const WORK_MODE =
  /\b(?:remote|hybrid|on-?site|onsite|in[- ]office|zdaln\p{L}*|hybryd\p{L}*|stacjonarn\p{L}*|z biura)\b/iu
const CONTRACT =
  /\b(?:b2b|uop|umow\p{L}*|kontrakt\p{L}*|contract|full[- ]time|part[- ]time|permanent|etat\p{L}*|freelance)\b/iu

/**
 * What the offer leaves open, read from its record and its text. With no text at all nothing can
 * be said about what it states, so every topic the record lacks is open.
 */
export function unknownTopics(offerText: string, facts: OfferFacts): UnknownTopic[] {
  const topics: UnknownTopic[] = []
  if (!facts.hasSalary && !PAY.test(offerText)) topics.push("salary")
  if (!facts.hasWorkMode && !WORK_MODE.test(offerText)) topics.push("work-mode")
  if (!facts.hasContract && !CONTRACT.test(offerText)) topics.push("contract")
  return topics
}

const STOP = new Set(
  "and the for with from that this your you our are will have has what which oraz lub dla przy jako jest się nie tak jak czy pod nad bez też także przez"
    .split(" ")
    .map((word) => word.trim())
)

const significant = (text: string) =>
  text
    .split(/[\s,;:()/|·•–—]+/)
    .map((word) => word.replace(/^["'„“(]+|["'”).,;:!?]+$/g, ""))
    .filter((word) => word.length >= 3 && !STOP.has(word.toLowerCase()))

/**
 * How well a story answers a requirement, by words alone. Strong: the requirement's keyword (or,
 * without one, every word of it) is in what the person did or achieved. Partial: it is elsewhere
 * in the story or in its themes, or at least half of the requirement's words are in the story.
 */
export function ruleFit(
  requirement: Pick<OfferRequirement, "text" | "keyword">,
  story: StoryFields
): StoryFit {
  const done = matchable(`${story.action}\n${story.result}`)
  const whole = matchable(`${storyBody(story)}\n${story.themes.join("\n")}`)
  const term = requirement.keyword?.trim() || requirement.text
  if (hasTerm(done, term)) return "strong"
  if (hasTerm(whole, term)) return "partial"
  const words = significant(requirement.text)
  if (words.length < 2) return "none"
  const found = words.filter((word) => hasTerm(whole, word)).length
  return found * 2 >= words.length ? "partial" : "none"
}

const FIT_RANK: Record<StoryFit, number> = { strong: 2, partial: 1, none: 0 }

/** The best story for a requirement by words; the earlier story wins a tie. */
function bestByRules(
  requirement: OfferRequirement,
  stories: PrepStory[]
): { story: PrepStory; fit: StoryFit } | null {
  let best: { story: PrepStory; fit: StoryFit } | null = null
  for (const story of stories) {
    const fit = ruleFit(requirement, story)
    if (fit !== "none" && (!best || FIT_RANK[fit] > FIT_RANK[best.fit])) best = { story, fit }
  }
  return best
}

/** The requirements a preparation covers: required first, then preferred, then soft. */
export function keyRequirements(analysis: OfferAnalysis | null): OfferRequirement[] {
  if (!analysis) return []
  return [...analysis.requirements]
    .sort((a, b) => ORDER.indexOf(a.importance) - ORDER.indexOf(b.importance))
    .slice(0, LIMIT.requirements)
}

export type PrepInput = {
  /** The offer's requirements; null when the offer was never read */
  analysis: OfferAnalysis | null
  /** The match of the person's data with them; null when there is none */
  report: MatchReport | null
  match: { kind: "round" | "fresh" | "none"; round: number | null }
  /** The saved stories; drafts are not the person's yet */
  stories: PrepStory[]
  offerText: string
  facts: OfferFacts
  /** Everything the person has said about themselves: their CV and profile */
  evidence: string
  hasCv: boolean
  /** The model's part; null without a model or when it gave nothing */
  reply: PrepReply | null
  /** False when no model is configured, which the page says */
  hasModel: boolean
}

/**
 * The preparation for one offer. Every list is built by rules first; the model's reply only
 * replaces a rule's wording or mapping where code could verify it.
 */
export function buildInterviewPrep(input: PrepInput): InterviewPrepContent {
  const { analysis, report, stories, offerText, evidence, reply } = input
  const requirements = keyRequirements(analysis)
  const byRequirement = new Map(requirements.map((item) => [item.id, item]))
  const byStory = new Map(stories.map((story) => [story.id, story]))
  const matched = new Map((report?.requirements ?? []).map((item) => [item.id, item]))
  // a question or a line may name what the offer or the person's own data names, nothing else
  const known = `${offerText}\n${evidence}\n${requirements.map((item) => item.text).join("\n")}`
  const invents = (text: string) =>
    unverifiedNumbers([text], known).length > 0 ||
    unverifiedTerms([text], known).some((term) => !POLITE.test(term))

  /* (b) which story answers which requirement */
  const proposed = new Map<string, { story: PrepStory; fit: StoryFit; evidence: string }>()
  for (const item of reply?.mapping ?? []) {
    const story = byStory.get(item.storyId.trim())
    const requirement = byRequirement.get(item.requirementId.trim())
    if (!story || !requirement || item.fit === "none") continue
    const fragment = line(item.evidence, 300)
    const found = fragment && quoteIn(storyBody(story), fragment) ? fragment : ""
    // a story nobody can point into does not count as strong; without a fragment, not at all
    const fit: StoryFit = found ? item.fit : item.fit === "strong" ? "partial" : "none"
    if (fit === "none") continue
    const current = proposed.get(requirement.id)
    if (!current || FIT_RANK[fit] > FIT_RANK[current.fit])
      proposed.set(requirement.id, { story, fit, evidence: found })
  }
  const mapping = requirements.map((requirement): StoryMapping => {
    const model = proposed.get(requirement.id)
    const rules = bestByRules(requirement, stories)
    const useModel = model && (!rules || FIT_RANK[model.fit] >= FIT_RANK[rules.fit])
    const chosen = useModel ? model : rules
    const lead = matched.get(requirement.id)?.evidence ?? ""
    return {
      requirementId: requirement.id,
      requirement: requirement.text,
      importance: requirement.importance,
      storyId: chosen?.story.id ?? null,
      fit: chosen?.fit ?? "none",
      evidence: useModel ? model.evidence : "",
      by: useModel ? "model" : "rules",
      unbacked: chosen ? unbackedFigures(chosen.story, evidence) : [],
      lead: chosen ? "" : lead,
    }
  })
  const storyFor = new Map(mapping.map((item) => [item.requirementId, item.storyId]))

  /* (a) likely questions by who asks */
  const worded = new Map<string, { text: string; audience: Audience | undefined }>()
  for (const item of reply?.questions ?? []) {
    const id = item.requirementId.trim()
    const text = line(item.text, 300)
    if (!byRequirement.has(id) || !text || worded.has(id) || invents(text)) continue
    worded.set(id, { text, audience: item.audience })
  }
  const questions: PrepQuestion[] = []
  for (const audience of AUDIENCES) {
    const own = requirements
      .map((requirement) => ({ requirement, model: worded.get(requirement.id) }))
      .filter(
        ({ requirement, model }) => (model?.audience ?? audienceOf(requirement.kind)) === audience
      )
      .slice(0, LIMIT.perAudience)
    for (const { requirement, model } of own) {
      questions.push({
        id: `${audience}:${requirement.id}`,
        audience,
        text: model?.text ?? null,
        basis: {
          kind: "requirement",
          requirementId: requirement.id,
          requirement: requirement.text,
          importance: requirement.importance,
        },
        storyId: storyFor.get(requirement.id) ?? null,
      })
    }
    for (const question of GENERAL_QUESTIONS[audience]) {
      questions.push({
        id: `${audience}:${question}`,
        audience,
        text: null,
        basis: { kind: "general", question },
        storyId: null,
      })
    }
  }

  /* (c) the risks: required items the match did not find met */
  const lines = new Map<string, string>()
  for (const item of reply?.risks ?? []) {
    const text = line(item.line, 400)
    if (text && !invents(text)) lines.set(item.requirementId.trim(), text)
  }
  const risks = report
    ? report.requirements
        .filter((item) => item.importance === "required" && item.status !== "met")
        .map((item): PrepRisk => {
          const model = lines.get(item.id)
          const text = model ?? item.note
          return {
            requirementId: item.id,
            requirement: item.text,
            status: item.status,
            gap: item.gap,
            evidence: item.evidence,
            line: text,
            by: model ? "model" : item.note ? "match" : "none",
          }
        })
    : null

  /* (d) questions to ask them */
  const asks: PrepAsk[] = []
  const flags = analysis?.redFlags ?? []
  const rest: { text: string; quote: string }[] = []
  const flagWording = new Map<string, string>()
  for (const item of reply?.asks ?? []) {
    const text = line(item.text, 300)
    const quote = line(item.quote, 200)
    if (!text || !quote || !quoteIn(offerText, quote) || invents(text)) continue
    const flag = flags.find((entry) => quoteIn(entry.quote, quote) || quoteIn(quote, entry.quote))
    if (flag) {
      if (!flagWording.has(flag.quote)) flagWording.set(flag.quote, text)
    } else if (!rest.some((entry) => entry.quote === quote)) rest.push({ text, quote })
  }
  flags.forEach((flag, index) => {
    asks.push({
      id: `flag:${index + 1}`,
      text: flagWording.get(flag.quote) ?? null,
      basis: { kind: "red-flag", quote: flag.quote, why: flag.why },
    })
  })
  rest.slice(0, LIMIT.modelAsks).forEach((item, index) => {
    asks.push({
      id: `offer:${index + 1}`,
      text: item.text,
      basis: { kind: "offer", quote: item.quote },
    })
  })
  for (const topic of unknownTopics(offerText, input.facts))
    asks.push({ id: `unknown:${topic}`, text: null, basis: { kind: "unknown", topic } })
  for (const ask of GENERAL_ASKS) {
    if (asks.length >= LIMIT.asks) break
    asks.push({ id: `general:${ask}`, text: null, basis: { kind: "general", ask } })
  }

  const missing: PrepGap[] = []
  if (!offerText.trim()) missing.push("offer-text")
  if (!requirements.length) missing.push("requirements")
  if (!report) missing.push("match")
  if (!stories.length) missing.push("stories")
  if (!input.hasCv) missing.push("cv")
  if (!input.hasModel) missing.push("model")

  return {
    version: 1,
    reader: reply ? "llm" : "rules",
    questions,
    mapping,
    risks,
    asks,
    stories: stories.map((story) => ({ id: story.id, title: story.title })),
    basis: {
      match: report ? input.match.kind : "none",
      matchRound: report ? input.match.round : null,
      score: report?.score ?? null,
      requirements: requirements.length,
    },
    missing,
  }
}

/** A saved story as a model sees it: its id, its themes and each part it has. */
export function storyForModel(story: PrepStory): Record<string, unknown> {
  const parts = Object.fromEntries(
    STORY_PARTS.filter((part) => story[part].trim()).map((part) => [
      part,
      story[part].slice(0, 900),
    ])
  )
  return { id: story.id, title: story.title, themes: story.themes, ...parts }
}
