import { createClaudeCliClient } from "./claude-cli"
import { createLlmClient, llmProvider } from "./client"
import type { LlmClient } from "./common"

export const DEFAULT_WRITING_MODEL = "sonnet"

/**
 * Client for text the person sends to an employer (answers, form fields): with claude-cli it
 * uses CLAUDE_WRITING_MODEL (default sonnet) instead of the fast CLAUDE_CLI_MODEL, and a longer
 * timeout. Other providers use their configured model. Null when no model is available.
 */
export function createWritingClient(
  env: Record<string, string | undefined> = process.env
): LlmClient | null {
  if (llmProvider(env) === "claude-cli") {
    return createClaudeCliClient({
      model: env.CLAUDE_WRITING_MODEL?.trim() || DEFAULT_WRITING_MODEL,
      timeoutMs: Number(env.CLAUDE_WRITING_TIMEOUT_MS) || 150_000,
    })
  }
  return createLlmClient()
}
