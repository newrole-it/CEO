import {
  runClaudePrompt as runPrompt,
  type ClaudeCliDeps,
  type ClaudeRunArgs,
  type ClaudeRunResult,
} from "@newrole/llm/claude-cli"
import { recordLlmCall } from "./usage"

/**
 * One headless Claude turn (@newrole/llm), logged for the AI usage tab. Code in this app that runs
 * `claude -p` itself, outside a client, uses this one rather than the package's.
 */
export function runClaudePrompt(
  args: ClaudeRunArgs,
  deps: ClaudeCliDeps & { maxConcurrent?: number } = {}
): Promise<ClaudeRunResult | null> {
  return runPrompt(args, { record: recordLlmCall, ...deps })
}
