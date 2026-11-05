import { createLlmClient as createClient, type LlmClient } from "@newrole/llm/client"
import { prismaLlmCache } from "./cache"
import { recordLlmCall } from "./usage"

/**
 * newrole.it's model client: @newrole/llm with replies cached in Postgres and every run logged
 * for the AI usage tab (LlmCall). Code in this app gets its client here rather than from the
 * package, so every process shares one cache and one log.
 */

export {
  estimateCost,
  hashCacheKey,
  isPersonalLlmPurpose,
  llmProvider,
  PERSONAL_LLM_PURPOSES,
  shouldStoreLlmCache,
  stripFences,
  UNTRUSTED_RULE,
  wrapUntrusted,
} from "@newrole/llm/client"
export type { LlmClient, LlmProvider, LlmResult } from "@newrole/llm/client"

export function createLlmClient(): LlmClient | null {
  return createClient({ cache: prismaLlmCache, record: recordLlmCall })
}
