/**
 * What one model run used, for a host application that keeps a log of it (newrole.it's AI usage
 * tab). The package only reads the counts; where they go is the host's `record`.
 *
 * `claude -p --output-format json` prints what the run cost: total_cost_usd, and per model under
 * modelUsage (inputTokens, outputTokens, cacheReadInputTokens, cacheCreationInputTokens,
 * webSearchRequests, costUSD, costBasis "list"). Shape checked on Claude Code 2.1.314.
 * Claude Code's docs say it computes that dollar figure locally from token counts at list price,
 * and that Pro, Max and Ultra include the usage in the subscription, so the figure is not billed
 * there (https://code.claude.com/docs/en/costs, read 2026-11-04).
 */

export type LlmCallUsage = {
  model: string
  /** Input tokens read without the prompt cache */
  tokenInput: number
  cacheWriteTokens: number
  cacheReadTokens: number
  tokenOutput: number
  webSearches: number
  /** What the provider reported itself. Null when it reports none. */
  reportedUsd: number | null
}

export type LlmCallRecord = LlmCallUsage & {
  purpose: string
  provider: "claude-cli" | "openai"
  /** False when the run ended without a usage report, so its tokens are unknown */
  usageKnown: boolean
  durationMs: number | null
}

/**
 * Where each run's usage goes. The host decides: newrole.it writes an LlmCall row. Without one
 * nothing is kept. It must not throw: a lost usage row must not fail the task that ran.
 */
export type RecordLlmCall = (call: LlmCallRecord) => Promise<void>

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Usage from the JSON object `claude -p` prints, error replies included: a failed run still used
 * tokens. modelUsage covers every model call of the run and adds up to total_cost_usd; the top-level
 * usage block can be smaller (2 input tokens against 1,172 in the checked run), so it is the fallback.
 */
export function readCliUsage(stdout: string): LlmCallUsage | null {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(stdout.trim()) as Record<string, unknown>
  } catch {
    return null
  }
  if (!payload || typeof payload !== "object") return null
  const total = typeof payload.total_cost_usd === "number" ? payload.total_cost_usd : null
  const byModel = payload.modelUsage
  if (byModel && typeof byModel === "object" && Object.keys(byModel).length) {
    const usage: LlmCallUsage = {
      model: Object.keys(byModel).join(", "),
      tokenInput: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      tokenOutput: 0,
      webSearches: 0,
      reportedUsd: total,
    }
    let summed = 0
    for (const item of Object.values(byModel as Record<string, Record<string, unknown>>)) {
      usage.tokenInput += count(item?.inputTokens)
      usage.cacheWriteTokens += count(item?.cacheCreationInputTokens)
      usage.cacheReadTokens += count(item?.cacheReadInputTokens)
      usage.tokenOutput += count(item?.outputTokens)
      usage.webSearches += count(item?.webSearchRequests)
      summed += count(item?.costUSD)
    }
    if (usage.reportedUsd == null && summed > 0) usage.reportedUsd = summed
    return usage
  }
  const usage = payload.usage as Record<string, unknown> | undefined
  if (!usage || typeof usage !== "object") return null
  const tools = usage.server_tool_use as Record<string, unknown> | undefined
  return {
    model: "",
    tokenInput: count(usage.input_tokens),
    cacheWriteTokens: count(usage.cache_creation_input_tokens),
    cacheReadTokens: count(usage.cache_read_input_tokens),
    tokenOutput: count(usage.output_tokens),
    webSearches: count(tools?.web_search_requests),
    reportedUsd: total,
  }
}
