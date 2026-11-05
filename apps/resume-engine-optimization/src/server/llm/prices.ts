/**
 * Published list prices in USD per 1,000,000 tokens. An estimate, not an invoice.
 * Cached-input discounts and batch prices are not applied.
 *
 * gpt-4o-mini: $0.15 input, $0.60 output.
 * gpt-4o: $2.50 input, $10 output.
 * OpenAI standard rates for these model ids.
 *
 * PLN uses the same approximate USD rate as salary display (packages/matching/config.ts, asOf 2026-10-01).
 */
export const MODEL_USD_PER_MILLION: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
}

export const USD_TO_PLN_ESTIMATE = 3.95

/** Tasks that call the model. Names match the `purpose` stored on each cached call. */
export const LLM_TASKS = [
  "candidate-profile",
  "profile-audit",
  "cv-audit",
  "query-expansion",
  "match-explanation",
  "job-industry",
  "role-classify",
] as const

export type LlmUsageRow = {
  purpose: string
  model: string
  calls: number
  tokenInput: number
  tokenOutput: number
}

export type LlmTaskTotal = {
  purpose: string
  calls: number
  tokenInput: number
  tokenOutput: number
  /** Null when a model in this task is missing from the price table. */
  usd: number | null
}

export function priceForModel(model: string): { input: number; output: number } | null {
  const name = model.trim().toLowerCase()
  const keys = Object.keys(MODEL_USD_PER_MILLION).sort((a, b) => b.length - a.length)
  const key = keys.find((item) => name === item || name.startsWith(`${item}-`))
  return key ? MODEL_USD_PER_MILLION[key] : null
}

export function estimateModelUsd(
  model: string,
  tokenInput: number,
  tokenOutput: number
): number | null {
  const price = priceForModel(model)
  if (!price) return null
  return (tokenInput / 1_000_000) * price.input + (tokenOutput / 1_000_000) * price.output
}

export function estimatePln(usd: number): number {
  return usd * USD_TO_PLN_ESTIMATE
}

/** One row per known task, plus any extra purpose found in stored calls. */
export function rollupLlmUsage(rows: LlmUsageRow[]): {
  tasks: LlmTaskTotal[]
  totalUsd: number | null
  unpriced: boolean
} {
  const byPurpose = new Map<
    string,
    { calls: number; tokenInput: number; tokenOutput: number; usd: number; unpriced: boolean }
  >()
  for (const purpose of LLM_TASKS) {
    byPurpose.set(purpose, { calls: 0, tokenInput: 0, tokenOutput: 0, usd: 0, unpriced: false })
  }
  for (const row of rows) {
    const current = byPurpose.get(row.purpose) ?? {
      calls: 0,
      tokenInput: 0,
      tokenOutput: 0,
      usd: 0,
      unpriced: false,
    }
    current.calls += row.calls
    current.tokenInput += row.tokenInput
    current.tokenOutput += row.tokenOutput
    const usd = estimateModelUsd(row.model, row.tokenInput, row.tokenOutput)
    if (usd == null) current.unpriced = true
    else current.usd += usd
    byPurpose.set(row.purpose, current)
  }
  const tasks = [...byPurpose.entries()].map(([purpose, value]) => ({
    purpose,
    calls: value.calls,
    tokenInput: value.tokenInput,
    tokenOutput: value.tokenOutput,
    usd: value.calls === 0 ? 0 : value.unpriced ? null : value.usd,
  }))
  const unpriced = tasks.some((task) => task.usd == null)
  const totalUsd = unpriced ? null : tasks.reduce((sum, task) => sum + (task.usd ?? 0), 0)
  return { tasks, totalUsd, unpriced }
}
