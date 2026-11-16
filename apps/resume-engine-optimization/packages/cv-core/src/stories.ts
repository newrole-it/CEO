import { z } from "zod"
import { fold } from "@newrole/matching/text"
import { inlineToText } from "./sanitize"
import { unverifiedNumbers, unverifiedTerms } from "./tailor"
import { quoteIn } from "./terms"

/**
 * The story bank: a person's reusable interview stories as situation, task, action, result and
 * what they took from it. The shape follows career-ops' templates/story-bank.template.md (MIT),
 * kept as fields instead of a markdown block.
 *
 * A model may draft stories from the person's CV and profile. Code decides what of a draft
 * stands: the experience it names must be a fragment of the person's data, a sentence with a
 * number or a name that data does not have is taken out, a result needs its own fragment, and the
 * reflection is never written for the person. What is taken out or left empty comes back as
 * something to fill in, never as an estimate.
 */

export const STORY_PARTS = ["situation", "task", "action", "result", "reflection"] as const
export type StoryPart = (typeof STORY_PARTS)[number]

export const STORY_MAX = { title: 160, part: 3000, theme: 40, themes: 8, source: 200 }

export type StoryFields = {
  title: string
  situation: string
  task: string
  action: string
  result: string
  reflection: string
  /** The themes and questions it is best for: "leadership", "conflict", "tell me about a failure" */
  themes: string[]
  /** Where it came from, in the person's words: the role or project */
  source: string
}

const oneLine = (text: string | null | undefined, max: number) =>
  inlineToText(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

const paragraph = (text: string | null | undefined, max: number) =>
  (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max)

/** Themes as stored: short, without repeats (case and accents aside), at most eight. */
export function cleanThemes(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const themes: string[] = []
  for (const item of value) {
    if (typeof item !== "string") continue
    const theme = oneLine(item, STORY_MAX.theme)
    const key = fold(theme)
    if (!theme || seen.has(key)) continue
    seen.add(key)
    themes.push(theme)
    if (themes.length >= STORY_MAX.themes) break
  }
  return themes
}

/** A story as it is stored: every part trimmed and cut to its limit. */
export function cleanStory(input: Partial<Record<keyof StoryFields, unknown>>): StoryFields {
  const text = (value: unknown) => (typeof value === "string" ? value : "")
  return {
    title: oneLine(text(input.title), STORY_MAX.title),
    situation: paragraph(text(input.situation), STORY_MAX.part),
    task: paragraph(text(input.task), STORY_MAX.part),
    action: paragraph(text(input.action), STORY_MAX.part),
    result: paragraph(text(input.result), STORY_MAX.part),
    reflection: paragraph(text(input.reflection), STORY_MAX.part),
    themes: cleanThemes(input.themes),
    source: oneLine(text(input.source), STORY_MAX.source),
  }
}

/** The parts of a story the person has not written yet. */
export function missingParts(story: Pick<StoryFields, StoryPart>): StoryPart[] {
  return STORY_PARTS.filter((part) => !story[part].trim())
}

/** What the person tells: every part but the themes, for matching and for prompts. */
export function storyBody(story: Pick<StoryFields, StoryPart | "title">): string {
  return [story.title, ...STORY_PARTS.map((part) => story[part])].filter(Boolean).join("\n")
}

export const storyKey = (title: string) =>
  fold(title)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()

/* ---------------------------------------------------------------- drafts */

export const StoryDraftReply = z.object({
  stories: z
    .array(
      z.object({
        title: z.string().max(400),
        source: z.string().max(400).optional().catch(undefined),
        evidence: z.string().max(800).optional().catch(undefined),
        situation: z.string().max(4000).optional().catch(undefined),
        task: z.string().max(4000).optional().catch(undefined),
        action: z.string().max(4000).optional().catch(undefined),
        result: z.string().max(4000).optional().catch(undefined),
        resultEvidence: z.string().max(800).optional().catch(undefined),
        themes: z.array(z.string().max(200)).max(16).catch([]),
        questions: z.array(z.string().max(600)).max(10).catch([]),
      })
    )
    .max(24)
    .catch([]),
})
export type StoryDraftReply = z.infer<typeof StoryDraftReply>

/** A number or a name a draft used that the person's data does not have; its sentence is gone. */
export const StoryRemoved = z.object({
  part: z.enum(["situation", "task", "action", "result"]),
  kind: z.enum(["number", "name"]),
  value: z.string(),
})
export type StoryRemoved = z.infer<typeof StoryRemoved>

/** What code found when it checked a draft against the person's data. */
export const StoryChecks = z.object({
  /** The fragment of the person's data the story stands on, found there */
  evidence: z.string(),
  removed: z.array(StoryRemoved),
  /** The model's questions for what the data does not say, in the person's language */
  questions: z.array(z.string()),
})
export type StoryChecks = z.infer<typeof StoryChecks>

/** A draft's checks as stored; null when they no longer parse. */
export function parseStoryChecks(value: unknown): StoryChecks | null {
  const parsed = StoryChecks.safeParse(value)
  return parsed.success ? parsed.data : null
}

export type StoryDraft = StoryFields & { checks: StoryChecks }

const DRAFT_LIMIT = 8
const CHECKED_PARTS = ["situation", "task", "action", "result"] as const

const sentences = (text: string) =>
  text
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)

/**
 * One part of a draft with every sentence taken out that has a number or a name the evidence does
 * not have. A tool-shaped word must be in the evidence as written; a capitalised word inside a
 * sentence counts by its stem (unverifiedTerms).
 */
function checkedPart(
  part: StoryRemoved["part"],
  text: string,
  evidence: string
): { text: string; removed: StoryRemoved[] } {
  const removed: StoryRemoved[] = []
  const kept = sentences(text).filter((sentence) => {
    const numbers = unverifiedNumbers([sentence], evidence)
    const names = unverifiedTerms([sentence], evidence)
    for (const value of numbers) removed.push({ part, kind: "number", value })
    for (const value of names) removed.push({ part, kind: "name", value })
    return !numbers.length && !names.length
  })
  return { text: kept.join(" "), removed }
}

/**
 * The model's drafts, kept to what the person's data shows. A draft stands only when:
 * - its `evidence` is a fragment found in the data (the experience is the person's own),
 * - its title names no number or name the data does not have,
 * - after the sentences with an unknown number or name are taken out, an action or a situation is
 *   left.
 * The result stays only when `resultEvidence` is found in the data too; otherwise it is left
 * empty for the person. The reflection is always the person's to write. Drafts whose title is
 * already in the bank (`existing`) are skipped.
 */
export function checkStoryDrafts(
  reply: StoryDraftReply,
  evidence: string,
  existing: string[] = []
): { drafts: StoryDraft[]; dropped: number } {
  const taken = new Set(existing.map(storyKey))
  const drafts: StoryDraft[] = []
  let dropped = 0
  for (const item of reply.stories) {
    const title = oneLine(item.title, STORY_MAX.title)
    const key = storyKey(title)
    if (!title || taken.has(key)) continue
    const fragment = oneLine(item.evidence, 300)
    const grounded = fragment && quoteIn(evidence, fragment)
    const titleClean =
      !unverifiedNumbers([title], evidence).length && !unverifiedTerms([title], evidence).length
    if (!grounded || !titleClean) {
      dropped += 1
      continue
    }
    const removed: StoryRemoved[] = []
    const parts = { situation: "", task: "", action: "", result: "" }
    for (const part of CHECKED_PARTS) {
      const checked = checkedPart(part, paragraph(item[part], STORY_MAX.part), evidence)
      parts[part] = checked.text
      removed.push(...checked.removed)
    }
    const resultFragment = oneLine(item.resultEvidence, 300)
    if (!resultFragment || !quoteIn(evidence, resultFragment)) parts.result = ""
    if (!parts.action && !parts.situation) {
      dropped += 1
      continue
    }
    taken.add(key)
    const source = oneLine(item.source, STORY_MAX.source)
    drafts.push({
      title,
      ...parts,
      reflection: "",
      themes: cleanThemes(item.themes),
      // a source the data does not have would be a made-up employer
      source: source && quoteIn(evidence, source) ? source : "",
      checks: {
        evidence: fragment,
        removed,
        questions: [...new Set(item.questions.map((question) => oneLine(question, 300)))]
          .filter(Boolean)
          .slice(0, 5),
      },
    })
    if (drafts.length >= DRAFT_LIMIT) break
  }
  return { drafts, dropped }
}

/**
 * Numbers in a story that the person's CV and profile do not have. The person may well know them;
 * this only says which figures nothing else backs, so they can check before saying them aloud
 * (after career-ops' story-provenance-check.mjs).
 */
export function unbackedFigures(story: Pick<StoryFields, StoryPart>, evidence: string): string[] {
  return unverifiedNumbers(
    STORY_PARTS.map((part) => story[part]),
    evidence
  ).slice(0, 8)
}
