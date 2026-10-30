/** Answer bank types shared by the service, the RPC, the MCP tools and the Chrome extension API. */

export const ANSWER_ORIGINS = ["manual", "extension", "mcp", "draft"] as const
export type AnswerOrigin = (typeof ANSWER_ORIGINS)[number]

export const ANSWER_LANGUAGES = ["pl", "en"] as const
export type AnswerLanguage = (typeof ANSWER_LANGUAGES)[number]

export function isAnswerOrigin(value: unknown): value is AnswerOrigin {
  return typeof value === "string" && (ANSWER_ORIGINS as readonly string[]).includes(value)
}

export function isAnswerLanguage(value: unknown): value is AnswerLanguage {
  return value === "pl" || value === "en"
}

/** One stored answer. The same questionKey can have several rows (variants, e.g. per company). */
export type AnswerView = {
  id: string
  question: string
  questionKey: string
  answer: string
  tags: string[]
  /** pl | en, null when unknown */
  language: string | null
  company: string | null
  jobTitle: string | null
  sourceUrl: string | null
  applicationId: string | null
  origin: AnswerOrigin
  useCount: number
  lastUsedAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export type ScoredAnswer = AnswerView & { score?: number }

/** How a draft came about: a stored answer reused verbatim, a model draft, or nothing. */
export type DraftReader = "reuse" | "llm" | "none"

export type DraftQuestion = {
  /** Caller's id for the question (form field key); results come back under it */
  key: string
  question: string
  maxChars?: number
  /** Select / radio options: the draft must be one of them, verbatim */
  options?: string[]
}

export type DraftContext = {
  company?: string | null
  jobTitle?: string | null
  jobText?: string | null
  url?: string | null
}

export type DraftResult = { text: string; basedOn: string[]; reader: DraftReader }
