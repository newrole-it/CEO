import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { composeDrafts } from "src/server/answers/compose"
import { MAX_ANSWER_LENGTH, MAX_QUESTION_LENGTH } from "src/server/answers/filter"
import { saveAnswer, searchAnswers } from "src/server/answers/service"
import type { AnswerView, DraftReader } from "src/server/answers/types"
import { clampLimit } from "./format"
import { failure, guard, reply } from "./tools"
import { currentUser } from "./user"

/** Answer bank tools (stream C): answers_search, answer_save, answer_draft. */

const languageSchema = z.enum(["pl", "en"])

const searchInput = {
  q: z
    .string()
    .max(200)
    .optional()
    .describe("Words to find in questions, answers, companies, job titles and tags"),
  question: z
    .string()
    .max(MAX_QUESTION_LENGTH)
    .optional()
    .describe(
      "A full question: results are ranked by similarity to it and carry a score from 0 to 1"
    ),
  tag: z.string().max(40).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}

const saveInput = {
  id: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Update this answer. Leave out to create a new one"),
  question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  answer: z
    .string()
    .min(1)
    .max(MAX_ANSWER_LENGTH)
    .describe("The final wording the person approved"),
  tags: z.array(z.string().max(40)).max(12).optional(),
  language: languageSchema.optional().describe("Detected from the text when left out"),
  company: z.string().max(200).optional(),
  jobTitle: z.string().max(200).optional(),
  sourceUrl: z.string().max(1000).optional(),
  applicationId: z
    .string()
    .max(64)
    .optional()
    .describe("Link to an application from applications_list"),
}

const draftInput = {
  questions: z
    .array(
      z.object({
        question: z.string().min(1).max(MAX_QUESTION_LENGTH),
        maxChars: z
          .number()
          .int()
          .min(1)
          .max(MAX_ANSWER_LENGTH)
          .optional()
          .describe("Overrides the shared maxChars"),
        options: z
          .array(z.string().max(300))
          .max(60)
          .optional()
          .describe("Select or radio options: the draft is one of them, verbatim"),
      })
    )
    .min(1)
    .max(30),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional().describe("Job title"),
  jobText: z
    .string()
    .max(60_000)
    .optional()
    .describe("The job posting text; up to 6000 characters are used"),
  url: z
    .string()
    .max(2000)
    .optional()
    .describe(
      "Job posting URL. If the offer is in the local index, its company, title and text are filled in"
    ),
  maxChars: z
    .number()
    .int()
    .min(1)
    .max(MAX_ANSWER_LENGTH)
    .optional()
    .describe("Limit for every question"),
  language: languageSchema.optional().describe("Default: the language of each question"),
}

const excerpt = (text: string, max = 280) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max)}…` : flat
}

function brief(row: AnswerView & { score?: number }) {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    tags: row.tags,
    language: row.language,
    company: row.company,
    jobTitle: row.jobTitle,
    useCount: row.useCount,
    origin: row.origin,
    updatedAt: new Date(row.updatedAt).toISOString(),
    ...(row.score != null ? { score: row.score } : {}),
  }
}

function resultLine(row: AnswerView & { score?: number }, index: number): string {
  const facts = [
    row.score != null ? `podobieństwo ${Math.round(row.score * 100)}%` : "",
    row.company ?? "",
    row.language ?? "",
    `użyto ${row.useCount}×`,
    `id ${row.id}`,
  ].filter(Boolean)
  return `${index + 1}. ${excerpt(row.question, 160)} (${facts.join(", ")})\n   ${excerpt(
    row.answer
  )}`
}

const READER_LABEL: Record<DraftReader, string> = {
  reuse: "z bazy, bez modelu",
  llm: "szkic Claude",
  none: "brak szkicu",
}

export function registerAnswerTools(server: McpServer) {
  server.registerTool(
    "answers_search",
    {
      title: "Szukaj w bazie odpowiedzi",
      description:
        "Search the person's bank of answers to application questions. Pass `question` with a full question to rank by similarity (deterministic, Polish and English, score 0-1), or `q` with words to find in questions, answers, companies and tags. With neither, the newest come first. Use it when they ask what they answered before; for a new answer use answer_draft, which already includes this search.",
      inputSchema: searchInput,
      annotations: { readOnlyHint: true },
    },
    guard(async (args: { q?: string; question?: string; tag?: string; limit?: number }) => {
      const user = await currentUser()
      const rows = await searchAnswers(user.id, {
        q: args.q,
        question: args.question,
        tag: args.tag,
        limit: clampLimit(args.limit, 10, 50),
      })
      const text = rows.length
        ? [`Odpowiedzi (${rows.length}):`, ...rows.map(resultLine)].join("\n")
        : "Brak pasujących odpowiedzi. Nową napiszesz z answer_draft."
      return reply(text, { answers: rows.map(brief) })
    })
  )

  server.registerTool(
    "answer_save",
    {
      title: "Zapisz odpowiedź",
      description:
        "Save the final wording of an answer to the person's bank (origin mcp). Pass `id` to update that answer. Without `id` it creates one: the same answer to the same question only counts one more use, and a different answer to the same question becomes a variant. Save only what the person approved. Do not save contact data, consents or EEO answers.",
      inputSchema: saveInput,
    },
    guard(
      async (args: {
        id?: string
        question: string
        answer: string
        tags?: string[]
        language?: "pl" | "en"
        company?: string
        jobTitle?: string
        sourceUrl?: string
        applicationId?: string
      }) => {
        const user = await currentUser()
        const { answer, created } = await saveAnswer({ ...args, userId: user.id, origin: "mcp" })
        const text = args.id
          ? `Zaktualizowano odpowiedź ${answer.id}.`
          : created
          ? `Zapisano nową odpowiedź ${answer.id}.`
          : `Ta odpowiedź już była w bazie (${answer.id}). Użyto jej ${answer.useCount}×.`
        return reply(text, { answer: brief(answer), created })
      }
    )
  )

  server.registerTool(
    "answer_draft",
    {
      title: "Napisz szkic odpowiedzi",
      description: [
        "Draft answers to one or more application questions. A stored answer that fits (similarity at least 0.85, same language, not naming another company, within the limit) comes back as it is; the rest go in one call to the writing model with the person's profile, CV, up to 5 similar past answers and the job context. It may take up to a minute.",
        "Show every draft to the person and say which saved answers it was based on. They decide the wording: drafts are never sent anywhere. Save the final wording with answer_save.",
        'A question with reader "none" has no draft because no model was available: write it with the person yourself, using answers_search and profile_get, and never invent experience, employers, numbers or certificates.',
      ].join("\n"),
      inputSchema: draftInput,
    },
    guard(
      async (args: {
        questions: { question: string; maxChars?: number; options?: string[] }[]
        company?: string
        title?: string
        jobText?: string
        url?: string
        maxChars?: number
        language?: "pl" | "en"
      }) => {
        if (!args.questions.length) return failure("Pass at least one question.")
        const user = await currentUser()
        const questions = args.questions.map((item, index) => ({
          key: `q${index + 1}`,
          question: item.question,
          maxChars: item.maxChars ?? args.maxChars,
          options: item.options,
        }))
        const { drafts, sources, jobFromIndex, company, jobTitle } = await composeDrafts({
          userId: user.id,
          questions,
          context: {
            company: args.company,
            jobTitle: args.title,
            jobText: args.jobText,
            url: args.url,
          },
          language: args.language,
        })
        const results = questions.map((item) => {
          const draft = drafts[item.key] ?? { text: "", basedOn: [], reader: "none" as const }
          return {
            question: item.question,
            text: draft.text,
            reader: draft.reader,
            maxChars: item.maxChars ?? null,
            basedOn: draft.basedOn.flatMap((id) => (sources[id] ? [brief(sources[id])] : [])),
          }
        })
        const text = results
          .map((item, index) => {
            const used = item.basedOn.length
              ? `Na podstawie: ${item.basedOn
                  .map((row) => `${excerpt(row.question, 80)} (id ${row.id})`)
                  .join("; ")}`
              : ""
            return [
              `${index + 1}. ${item.question} [${READER_LABEL[item.reader]}]`,
              item.text || "(brak tekstu)",
              used,
            ]
              .filter(Boolean)
              .join("\n")
          })
          .join("\n\n")
        return reply(
          `${text}\n\nPokaż szkice osobie. Po akceptacji zapisz ostateczną wersję przez answer_save.`,
          { drafts: results, company, jobTitle, jobFromIndex }
        )
      }
    )
  )
}
