"use server"
import { resolver } from "src/server/rpc"
import { AuthorizationError } from "src/shared/errors"
import { z } from "zod"
import db from "db"
import { DEFAULT_CONFIG } from "@newrole/matching/config"
import { ensureFxRates, nbpTable, plnPerUnit } from "@newrole/matching/fx"
import { llmProvider, type LlmProvider } from "src/server/llm/client"
import {
  groupUsd,
  rollupCalls,
  usageTabVisible,
  type LlmCallGroup,
  type UsageTask,
  type UsageTotals,
} from "src/server/llm/usage"
import { DEFAULT_USAGE_PERIOD, USAGE_PERIODS, type UsagePeriod } from "src/shared/usage"

const RECENT = 25

export type UsageCall = {
  id: string
  at: string
  purpose: string
  model: string
  tokenInput: number
  cacheWriteTokens: number
  cacheReadTokens: number
  tokenOutput: number
  webSearches: number
  usd: number | null
  usageKnown: boolean
  durationMs: number | null
}

export type UsageSnapshot = {
  period: UsagePeriod
  provider: LlmProvider
  /** The first run this install recorded: nothing before it is counted */
  firstAt: string | null
  total: UsageTotals
  tasks: UsageTask[]
  recent: UsageCall[]
  /** PLN for one USD, as plnPerUnit picks it: FX_USD_PLN, then NBP table A, then the default */
  fx: { rate: number; source: "env" | "nbp" | "default"; date: string | null }
}

/** Model runs of this install by task. Counts only; every figure comes from stored LlmCall rows. */
export default resolver.pipe(
  resolver.zod(z.object({ period: z.enum(USAGE_PERIODS).default(DEFAULT_USAGE_PERIOD) })),
  resolver.authorize(),
  async ({ period }, ctx): Promise<UsageSnapshot> => {
    const user = await db.user.findUnique({
      where: { id: ctx.session.userId! },
      select: { role: true },
    })
    if (!user || !usageTabVisible(user.role)) throw new AuthorizationError()
    const where =
      period === "all"
        ? {}
        : { createdAt: { gte: new Date(Date.now() - Number(period) * 24 * 60 * 60 * 1000) } }
    const [grouped, recent, first] = await Promise.all([
      db.llmCall.groupBy({
        by: ["purpose", "provider", "model", "usageKnown"],
        where,
        _count: { _all: true, reportedUsd: true },
        _sum: {
          tokenInput: true,
          cacheWriteTokens: true,
          cacheReadTokens: true,
          tokenOutput: true,
          webSearches: true,
          reportedUsd: true,
        },
      }),
      db.llmCall.findMany({ where, orderBy: { createdAt: "desc" }, take: RECENT }),
      db.llmCall.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ensureFxRates(),
    ])
    const groups: LlmCallGroup[] = grouped.map((row) => ({
      purpose: row.purpose,
      provider: row.provider,
      model: row.model,
      usageKnown: row.usageKnown,
      calls: row._count._all,
      reportedCalls: row._count.reportedUsd,
      tokenInput: row._sum.tokenInput ?? 0,
      cacheWriteTokens: row._sum.cacheWriteTokens ?? 0,
      cacheReadTokens: row._sum.cacheReadTokens ?? 0,
      tokenOutput: row._sum.tokenOutput ?? 0,
      webSearches: row._sum.webSearches ?? 0,
      reportedUsd: row._sum.reportedUsd,
    }))
    const { tasks, total } = rollupCalls(groups)
    const table = nbpTable()
    return {
      period,
      provider: llmProvider(),
      firstAt: first?.createdAt.toISOString() ?? null,
      total,
      tasks,
      recent: recent.map((row) => ({
        id: row.id,
        at: row.createdAt.toISOString(),
        purpose: row.purpose,
        model: row.model,
        tokenInput: row.tokenInput,
        cacheWriteTokens: row.cacheWriteTokens,
        cacheReadTokens: row.cacheReadTokens,
        tokenOutput: row.tokenOutput,
        webSearches: row.webSearches,
        usd: groupUsd({
          ...row,
          calls: 1,
          reportedCalls: row.reportedUsd == null ? 0 : 1,
        }),
        usageKnown: row.usageKnown,
        durationMs: row.durationMs,
      })),
      fx: {
        rate: plnPerUnit("USD") ?? DEFAULT_CONFIG.fx.toPln.USD,
        ...(Number(process.env.FX_USD_PLN) > 0
          ? { source: "env" as const, date: null }
          : table?.rates.USD
            ? { source: "nbp" as const, date: table.effectiveDate }
            : { source: "default" as const, date: DEFAULT_CONFIG.fx.asOf }),
      },
    }
  }
)
