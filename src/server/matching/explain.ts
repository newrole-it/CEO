import {
  buildMatchExplanationMessages,
  fallbackExplanation,
  finalizeExplanation,
} from "@newrole/matching/match-explanation.schema"
import type { ScoreResult } from "@newrole/matching/scoring"
import type { MatchProfile, NormalizedPosting } from "@newrole/matching/types"
import type { LlmClient } from "src/server/llm/client"

/** Only the top matches get a model-written reason; the rest use the deterministic summary. */
export const MAX_LLM_EXPLANATIONS = 6
const REASON_CHARS = 500

export type Explained = { reason: string; tokenInput: number; tokenOutput: number }

/**
 * One match reason. The model is asked only for the first MAX_LLM_EXPLANATIONS matches, never
 * for a posting whose source opted out of AI use. Any failure falls back to the rule summary.
 */
export async function explainMatch(args: {
  llm: LlmClient | null
  posting: NormalizedPosting
  score: ScoreResult
  profile: MatchProfile
  index: number
  llmOptOut?: boolean
  userId?: number
}): Promise<Explained> {
  const { llm, posting, score, profile, index, llmOptOut, userId } = args
  const fallback: Explained = {
    reason: fallbackExplanation(score).summary.slice(0, REASON_CHARS),
    tokenInput: 0,
    tokenOutput: 0,
  }
  if (!llm || index >= MAX_LLM_EXPLANATIONS || llmOptOut) return fallback
  const messages = buildMatchExplanationMessages({ posting, score, profile, language: "en" })
  const system = messages.find((message) => message.role === "system")?.content ?? ""
  const user = messages.find((message) => message.role === "user")?.content ?? ""
  let result: Awaited<ReturnType<LlmClient["completeText"]>> = null
  try {
    result = await llm.completeText({
      purpose: "match-explanation",
      system,
      user,
      maxTokens: 900,
      userId,
    })
  } catch {
    result = null
  }
  if (!result?.data) return fallback
  return {
    reason: finalizeExplanation(result.data, score).explanation.summary.slice(0, REASON_CHARS),
    tokenInput: result.tokenInput,
    tokenOutput: result.tokenOutput,
  }
}
