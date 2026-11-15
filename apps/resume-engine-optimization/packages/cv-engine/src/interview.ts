import type { z } from "zod"
import type { CvLocale } from "@newrole/cv-core/blank"
import type { MatchReport, OfferAnalysis } from "@newrole/cv-core/match"
import { checkStoryDrafts, StoryDraftReply, type StoryDraft } from "@newrole/cv-core/stories"
import {
  keyRequirements,
  PrepReply,
  storyForModel,
  type PrepStory,
} from "@newrole/cv-core/stories-prep"
import { OFFER_TEXT_LIMIT } from "@newrole/cv-core/tailor"
import { wrapLong, wrapUntrusted, type LlmClient } from "@newrole/llm/common"
import { humanStyle } from "@newrole/llm/human-style"

/**
 * The model's two steps for the time after an application is sent: drafting interview stories
 * from the person's own data, and wording the preparation for one offer. The structure follows
 * career-ops' modes/interview-prep.md and templates/story-bank.template.md (MIT); the prompts are
 * newrole.it's own. @newrole/cv-core/stories and /stories-prep decide what of each reply stands.
 * Each returns null when the model gives nothing usable.
 */

const STEP_TIMEOUT_MS = 150_000

/** The purposes these steps log their model calls under (/usage counts them). */
export const INTERVIEW_PURPOSES = ["interview-stories", "interview-prep"] as const

const LANGUAGE: Record<CvLocale, string> = { pl: "Polish", en: "English" }

const ADDRESS_RULE: Record<CvLocale, string> = {
  pl: ' Questions for the candidate use the informal, capitalised "Ty". The story itself is in the first person; if the verbs in the data show the candidate\'s gender, match them, never infer it from the name, and otherwise phrase the sentence so it needs no gendered verb.',
  en: " The story itself is in the first person.",
}

const STORIES_SYSTEM = `You draft interview stories for a candidate from their own CV and profile. Each story is one real piece of work the data describes, told as situation, task, action and result, so the candidate can reuse it for behavioural questions.

Truth comes first. Code checks every draft against the candidate's data and deletes what it cannot find there:
- Use only what the data states. Never add or estimate a number, metric, team size, date, employer, client, tool, technology or outcome. Keep every number exactly as written.
- "evidence": a fragment copied exactly from the data that shows this piece of work, at most 25 words. A story without it is discarded.
- "source": the employer and role, or the project, the story comes from, copied exactly from the data.
- "result": only an outcome the data states. "resultEvidence": the fragment that states it, copied exactly, at most 25 words. When the data states no outcome, leave both empty.
- When the data does not say something a good story needs (what the starting point was, what exactly the candidate did themselves, what changed, how it was measured), leave that part short or empty and ask for it in "questions". Ask, never guess.
- Do not write a reflection or a lesson learned: only the candidate knows it.

Choose pieces of work that differ: different roles, different kinds of challenge. Prefer the recent and the ones with a stated outcome. Do not repeat a story whose title is listed as already in the bank.

Each part is one to three plain sentences. "themes": two to four short labels for the questions the story is best for (for example leadership, conflict, failure, ambiguity, deadline, stakeholders, mentoring, a technical decision), every label written in the language of the stories, never left in English when that language is another.`

const STORIES_FORMAT = `Return JSON:
{"stories":[{"title":"...","source":"...","evidence":"...","situation":"...","task":"...","action":"...","result":"...","resultEvidence":"...","themes":["..."],"questions":["..."]}]}`

/**
 * Step "stories": drafts from the person's data, already checked against it
 * (checkStoryDrafts). `evidence` is everything the person has said about themselves.
 */
export async function draftStoryBank(input: {
  llm: LlmClient
  /** The candidate context a model may read (profile, facts, CV) */
  context: string
  evidence: string
  /** Titles already in the bank, saved or draft */
  existing: string[]
  /** The language of the stories and of the questions for the person */
  locale: CvLocale
  count?: number
  userId?: number
}): Promise<{ drafts: StoryDraft[]; dropped: number } | null> {
  const { llm, locale } = input
  if (!input.context.trim()) return null
  const count = Math.max(1, Math.min(8, input.count ?? 5))
  const reply = await llm.completeJson({
    purpose: "interview-stories",
    system: [STORIES_SYSTEM, humanStyle([locale]), STORIES_FORMAT].join("\n\n"),
    user: [
      `Language of the stories, themes and questions: ${LANGUAGE[locale]}.${ADDRESS_RULE[locale]}`,
      `Draft up to ${count} stories.`,
      "",
      "Titles already in the bank:",
      input.existing.length
        ? wrapUntrusted(
            "bank_titles",
            input.existing
              .slice(0, 60)
              .map((title) => `- ${title}`)
              .join("\n")
          )
        : "(none)",
      "",
      "The candidate's data (their own profile and CV):",
      `<candidate_context>\n${input.context}\n</candidate_context>`,
    ].join("\n"),
    // .catch() widens the schema's input type; its output is what the client returns
    schema: StoryDraftReply as unknown as z.ZodType<StoryDraftReply>,
    maxTokens: 900 + count * 700,
    timeoutMs: STEP_TIMEOUT_MS,
    userId: input.userId,
  })
  if (!reply?.data) return null
  return checkStoryDrafts(reply.data, input.evidence, input.existing)
}

const PREP_SYSTEM = `You help a candidate prepare for interviews for one job offer. You get the offer's requirements, what a check of the candidate's data against them found, the candidate's saved interview stories and the offer's text. Code verifies every part of your reply and drops what it cannot verify.

1. "questions": for each requirement id, one question an interviewer would plausibly ask about it, at most 25 words. These are inferred from the offer: never write or imply that this company is known to ask it, and never name an interviewer, a team, a product or a tool the offer does not name. "audience" says who would ask it: "recruiter" (the first screen: fit, logistics, formal requirements), "manager" (the hiring manager: scope, ownership, ways of working) or "peer" (the technical or peer round: depth in the actual work).
2. "mapping": which saved story answers which requirement. Only pairs that fit: "strong" when the story directly shows the requirement, "partial" when it is adjacent and needs reframing. "evidence": a fragment copied exactly from that story that shows it, at most 25 words; a pair without a fragment found in the story is discarded. Use the ids given. Leave a requirement out when no story fits: a missing story is useful to know.
3. "risks": for each requirement listed under risks, one honest line the candidate can say when asked about it, at most 40 words: what they do have that is closest, said plainly. Never claim the requirement is met, never add a number, tool or experience the candidate's data does not state, and never say they are learning something they have not said they are learning.
4. "asks": up to 6 questions the candidate should ask the company, each resting on something the offer's text says or leaves vague. "quote": the fragment of the offer it rests on, copied exactly, at most 20 words; a question without a fragment found in the offer is discarded. Cover each listed red flag first.`

const PREP_FORMAT = `Return JSON:
{"questions":[{"requirementId":"r1","audience":"peer","text":"..."}],"mapping":[{"requirementId":"r1","storyId":"...","fit":"strong","evidence":"..."}],"risks":[{"requirementId":"r3","line":"..."}],"asks":[{"text":"...","quote":"..."}]}`

/**
 * Step "prep": the model's wording and mapping for one offer's preparation, as it replied.
 * buildInterviewPrep in @newrole/cv-core/stories-prep verifies it. Null when there are no
 * requirements to work from or the model gives nothing.
 */
export async function draftInterviewPrep(input: {
  llm: LlmClient
  offer: { company: string; title: string; text: string }
  analysis: OfferAnalysis
  report: MatchReport | null
  stories: PrepStory[]
  /** The candidate context a model may read */
  context: string
  /** The language of everything written for the person */
  locale: CvLocale
  userId?: number
}): Promise<PrepReply | null> {
  const { llm, offer, analysis, report, locale } = input
  const requirements = keyRequirements(analysis)
  if (!requirements.length) return null
  const status = new Map((report?.requirements ?? []).map((item) => [item.id, item]))
  const risks = (report?.requirements ?? []).filter(
    (item) => item.importance === "required" && item.status !== "met"
  )
  const reply = await llm.completeJson({
    purpose: "interview-prep",
    system: [PREP_SYSTEM, humanStyle([locale]), PREP_FORMAT].join("\n\n"),
    user: [
      `Language for everything you write: ${LANGUAGE[locale]}.`,
      "",
      wrapUntrusted("job", `Company: ${offer.company}\nTitle: ${offer.title}`),
      "",
      "The offer's requirements, with what the check of the candidate's data found:",
      wrapUntrusted(
        "requirements",
        requirements
          .map((item) => {
            const found = status.get(item.id)
            return `${item.id} [${item.importance}, ${item.kind}${
              found ? `, ${found.status}` : ""
            }] ${item.text}`
          })
          .join("\n")
      ),
      "",
      "Risks (required and not met):",
      risks.length
        ? wrapUntrusted(
            "risks",
            risks
              .map(
                (item) =>
                  `${item.id} [${item.status}] ${item.text}${
                    item.evidence ? ` | the data shows: ${item.evidence}` : ""
                  }`
              )
              .join("\n")
          )
        : "(none known)",
      "",
      "Red flags found in the offer:",
      analysis.redFlags.length
        ? wrapUntrusted("red_flags", analysis.redFlags.map((flag) => `- ${flag.quote}`).join("\n"))
        : "(none)",
      "",
      "The candidate's saved stories:",
      input.stories.length
        ? `<stories>\n${JSON.stringify(input.stories.slice(0, 30).map(storyForModel))}\n</stories>`
        : "(none: leave mapping empty)",
      "",
      "Candidate context (the candidate's own profile and CV):",
      `<candidate_context>\n${input.context || "(empty)"}\n</candidate_context>`,
      ...(offer.text
        ? ["", "The offer's text:", wrapLong("job_text", offer.text, OFFER_TEXT_LIMIT)]
        : []),
    ].join("\n"),
    schema: PrepReply as unknown as z.ZodType<PrepReply>,
    maxTokens: 4000,
    timeoutMs: STEP_TIMEOUT_MS,
    userId: input.userId,
  })
  return reply?.data ?? null
}
