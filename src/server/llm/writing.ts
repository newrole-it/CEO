import { createWritingClient as createClient } from "@newrole/llm/writing"
import type { LlmClient } from "@newrole/llm/common"
import { prismaLlmCache } from "./cache"

export { DEFAULT_WRITING_MODEL } from "@newrole/llm/writing"

/** The writing client of @newrole/llm (CLAUDE_WRITING_MODEL), with replies cached in Postgres. */
export function createWritingClient(
  env: Record<string, string | undefined> = process.env
): LlmClient | null {
  return createClient(env, { cache: prismaLlmCache })
}
