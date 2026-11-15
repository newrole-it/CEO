import type { z } from "zod"
import type { CvLocale } from "@newrole/cv-core/blank"
import { applyGather, GatherReply, type Gathered, type GatherNote } from "@newrole/cv-core/gather"
import type { OwnChange } from "@newrole/cv-core/own-changes"
import type { CvContent } from "@newrole/cv-core/schema"
import { cvForModel } from "@newrole/cv-core/tailor"
import { cvPlainText } from "@newrole/cv-core/text"
import type { LlmClient } from "@newrole/llm/common"
import { humanStyle } from "@newrole/llm/human-style"
import { WRITING_TIMEOUT_MS } from "./tailor"

/**
 * "Zbierz wszystko do CV ogólnego": what the person added by hand in their other CVs
 * (@newrole/cv-core/own-changes), merged into the general CV by the model. The model writes the
 * sections it changes and @newrole/cv-core/gather's applyGather decides what of them may land.
 * Nothing is stored here: the caller shows the draft to the person, who saves it or not.
 */

/** One other CV of the person: what they changed in it by hand, and its text as evidence. */
export type GatherSourceInput = {
  title: string
  /** The offer it was written for; null for a general CV */
  company: string | null
  role: string | null
  language: CvLocale
  changes: OwnChange[]
  /** The CV as plain text: a number in it is a fact about the person */
  text: string
}

export type GatherDraft = Gathered & { notes: GatherNote[] }

/** Named in English: the model reads this, not the person. */
const LANGUAGE_NAME: Record<CvLocale, string> = { pl: "Polish", en: "English" }

const GATHER_SYSTEM = `You merge changes a candidate made by hand in other versions of their CV into their general CV. Each source is one of those versions, written for one job offer or kept for another purpose, with what the candidate added or reworded in it. Code merges your reply into the CV, so name sections and items by their ids; leave the id out for a new item or a new section. The ids inside a change are the source's own and may differ from the general CV's: find the role, skill line or section by its name in the general CV and use the id it has there.

What goes in:
- Every fact in the changes ends up in the CV once, where it belongs: in the role, the skills line or the section it is about.
- Where a change and the CV say the same thing, write one line that holds everything both say, clear and unambiguous. Do not keep two lines for one fact.
- Where a change and the CV disagree on a fact (a number, a date, a name), keep the CV's line and report the change in "notes" as skipped.
- Skills and technology lines: add what is missing in its place and keep the rest, and the line's form (<strong>Label:</strong> a, b, c).

Truth comes first:
- Use only facts in the CV, the changes and the candidate context. Never add employers, titles, dates, numbers, metrics, technologies, certificates, education or responsibilities they do not state.
- Keep every number exactly as written. Do not round, add up or estimate.
- Drop no fact the CV has. When you change a role's bullets, return the role's whole bullet list, the unchanged bullets included. Never remove a role, a section or an item.
- Write nothing about the company a source was written for, and no wording aimed at one offer: the general CV is for any employer.

Write in the language given for the CV, in the CV's voice, grammatical person and line length; a change written in another language is translated. In Polish keep the grammatical gender the CV uses.

What you may write: "body" of a text section; "summary", "bullets" and "tech" of a role; "label" and "text" of a skills item; "body" of a card. A role's company, title and dates stay as they are: code ignores changes to them. A new item carries all of its fields.`

const GATHER_FORMAT = `Format: body fields may use <strong>, <em> and <br>, and nothing else: no other tags, links, markdown or placeholders.

"notes" has one entry per change: "source" is the source's title exactly as given, "outcome" is "added" (a new fact went in), "merged" (it was joined with a line the CV had) or "skipped" (already there, about the offer's company, or it contradicts the CV), and "text" is one sentence in the language given for notes saying where it went or why it was left out.

Return JSON with only the sections you change, and in them only the items you change or add:
{"sections":[{"id":"<section id>","items":[{"id":"<item id>","bullets":["..."],"tech":"..."},{"label":"...","text":"..."}]},{"id":"<section id>","body":"..."},{"type":"text","title":"...","body":"..."}],"notes":[{"source":"...","outcome":"added","text":"..."}]}`

const attr = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

function sourceBlock(source: GatherSourceInput): string {
  const offer = [source.company, source.role]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" · ")
  const head = [
    `title="${attr(source.title)}"`,
    ...(offer ? [`written_for="${attr(offer)}"`] : []),
    `language="${source.language}"`,
  ].join(" ")
  // the candidate's own CV text, like <cv>: closing tags inside it must not end the block
  const json = JSON.stringify(source.changes).replace(/<\/source>/gi, "")
  return `<source ${head}>\n${json}\n</source>`
}

/**
 * The general CV with the changes merged in, not stored. Null when there is nothing to merge,
 * the model gives nothing usable, or its reply does not make a valid CV.
 */
export async function gatherCv(input: {
  llm: LlmClient
  cv: CvContent
  /** The general CV's language: what the result is written in */
  language: CvLocale
  /** The language of the notes for the person */
  locale: CvLocale
  sources: GatherSourceInput[]
  context: string
  userId?: number
}): Promise<GatherDraft | null> {
  const { llm, cv, language, locale, sources, context, userId } = input
  if (!sources.length) return null
  const json = JSON.stringify(cvForModel(cv))
  const reply = await llm.completeJson({
    purpose: "cv-gather",
    system: [GATHER_SYSTEM, humanStyle([language]), GATHER_FORMAT].join("\n\n"),
    user: [
      `Write in: ${LANGUAGE_NAME[language]}`,
      `Language for notes: ${LANGUAGE_NAME[locale]}`,
      "",
      "Candidate context (the candidate's own profile):",
      `<candidate_context>\n${context || "(empty)"}\n</candidate_context>`,
      "",
      "The general CV:",
      `<cv>\n${json}\n</cv>`,
      "",
      "What the candidate changed by hand in their other CVs:",
      ...sources.map(sourceBlock),
    ].join("\n"),
    // .catch() widens the schema's input type; its output is what the client returns
    schema: GatherReply as unknown as z.ZodType<GatherReply>,
    maxTokens: Math.min(16000, Math.ceil(json.length / 2.5) + 3000),
    timeoutMs: WRITING_TIMEOUT_MS,
    userId,
  })
  if (!reply?.data) return null
  const gathered = applyGather(cv, reply.data.sections, {
    evidence: [cvPlainText(cv), ...sources.map((source) => source.text), context].join("\n"),
  })
  if (!gathered) return null
  return { ...gathered, notes: reply.data.notes }
}
