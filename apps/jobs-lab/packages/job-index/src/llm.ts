import type { ClaudeCliDeps, ClaudeRunArgs, ClaudeRunResult } from "@newrole/llm/claude-cli"
import type { LlmClient } from "@newrole/llm/client"
import { jobIndexHost } from "./host"

/** The engine's model calls, through the client and the Claude runner its app gave it. */

export { estimateCost, wrapUntrusted } from "@newrole/llm/client"
export type { LlmClient } from "@newrole/llm/client"

export function createLlmClient(): LlmClient | null {
  return jobIndexHost().llm()
}

export function runClaudePrompt(
  args: ClaudeRunArgs,
  deps: ClaudeCliDeps & { maxConcurrent?: number } = {}
): Promise<ClaudeRunResult | null> {
  return jobIndexHost().runClaudePrompt(args, deps)
}
