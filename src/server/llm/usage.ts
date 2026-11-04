import db from "db"
import type { LlmCallRecord } from "@newrole/llm/usage"
import { harvestMode } from "src/server/harvest/mode"
import { isLocalInstall } from "src/server/local-install"
import { estimateModelUsd } from "./prices"

/**
 * The AI usage tab's log: one LlmCall row per model run, with counts only. @newrole/llm reads the
 * counts (usage.ts there) and hands each run to recordLlmCall, which client.ts, writing.ts and
 * claude-cli.ts here pass it as `record`.
 */

export type { LlmCallRecord, LlmCallUsage, RecordLlmCall } from "@newrole/llm/usage"

/**
 * Who sees the AI usage tab. On a local install every account runs on the one subscription of
 * the person at this computer, so all of them see every run. Elsewhere only an admin does.
 */
export function usageTabVisible(
  role: string | null | undefined,
  local = isLocalInstall()
): boolean {
  return local || role === "ADMIN"
}

/** Never throws: a lost usage row must not fail the task that ran. */
export async function recordLlmCall(call: LlmCallRecord): Promise<void> {
  // A cloud harvest has no database.
  if (harvestMode()) return
  try {
    await db.llmCall.create({
      data: {
        purpose: call.purpose,
        provider: call.provider,
        model: call.model,
        tokenInput: Math.round(call.tokenInput),
        cacheWriteTokens: Math.round(call.cacheWriteTokens),
        cacheReadTokens: Math.round(call.cacheReadTokens),
        tokenOutput: Math.round(call.tokenOutput),
        webSearches: Math.round(call.webSearches),
        reportedUsd: call.reportedUsd,
        usageKnown: call.usageKnown,
        durationMs: call.durationMs == null ? null : Math.round(call.durationMs),
      },
    })
  } catch (error) {
    console.error("LLM usage not recorded", error instanceof Error ? error.message : error)
  }
}

/** Rows of one task, model, provider and usageKnown, summed. A single row is a group of one. */
export type LlmCallGroup = {
  purpose: string
  provider: string
  model: string
  usageKnown: boolean
  calls: number
  tokenInput: number
  cacheWriteTokens: number
  cacheReadTokens: number
  tokenOutput: number
  webSearches: number
  /** Sum of the reported costs; null when no row in the group reported one */
  reportedUsd: number | null
  /** Rows in the group that reported a cost */
  reportedCalls: number
}

export type UsageTotals = {
  calls: number
  /** Runs that ended without a usage report */
  unknownCalls: number
  tokenInput: number
  cacheWriteTokens: number
  cacheReadTokens: number
  tokenOutput: number
  webSearches: number
  usd: number
  /** Runs with no reported cost and no price in the table; usd leaves them out */
  unpricedCalls: number
}

export type UsageTask = UsageTotals & { purpose: string; models: string[] }

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    unknownCalls: 0,
    tokenInput: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenOutput: 0,
    webSearches: 0,
    usd: 0,
    unpricedCalls: 0,
  }
}

/** USD of a group: the reported cost, else the price table. Null when neither has it. */
export function groupUsd(group: LlmCallGroup): number | null {
  if (!group.usageKnown) return 0
  if (group.reportedCalls > 0) return group.reportedUsd ?? 0
  return estimateModelUsd(
    group.model,
    group.tokenInput + group.cacheWriteTokens + group.cacheReadTokens,
    group.tokenOutput
  )
}

function add(into: UsageTotals, group: LlmCallGroup) {
  into.calls += group.calls
  if (!group.usageKnown) into.unknownCalls += group.calls
  into.tokenInput += group.tokenInput
  into.cacheWriteTokens += group.cacheWriteTokens
  into.cacheReadTokens += group.cacheReadTokens
  into.tokenOutput += group.tokenOutput
  into.webSearches += group.webSearches
  const usd = groupUsd(group)
  if (usd == null) into.unpricedCalls += group.calls
  else {
    into.usd += usd
    // Part of the group reported a cost and part did not (a Claude Code version change).
    if (group.usageKnown && group.reportedCalls > 0)
      into.unpricedCalls += group.calls - group.reportedCalls
  }
}

/** Totals per task, most expensive first, and for everything. */
export function rollupCalls(groups: LlmCallGroup[]): { tasks: UsageTask[]; total: UsageTotals } {
  const byPurpose = new Map<string, UsageTask>()
  const total = emptyTotals()
  for (const group of groups) {
    let task = byPurpose.get(group.purpose)
    if (!task) {
      task = { purpose: group.purpose, models: [], ...emptyTotals() }
      byPurpose.set(group.purpose, task)
    }
    add(task, group)
    add(total, group)
    if (group.usageKnown && group.model && !task.models.includes(group.model))
      task.models.push(group.model)
  }
  const tasks = [...byPurpose.values()].sort(
    (a, b) => b.usd - a.usd || b.calls - a.calls || a.purpose.localeCompare(b.purpose)
  )
  return { tasks, total }
}
