import { describe, expect, it } from "vitest"
import { groupUsd, rollupCalls, usageTabVisible, type LlmCallGroup } from "./usage"

function group(overrides: Partial<LlmCallGroup>): LlmCallGroup {
  return {
    purpose: "cv-audit",
    provider: "claude-cli",
    model: "claude-haiku-5-5",
    usageKnown: true,
    calls: 1,
    tokenInput: 100,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenOutput: 10,
    webSearches: 0,
    reportedUsd: 0.01,
    reportedCalls: 1,
    ...overrides,
  }
}

describe("usage rollup", () => {
  it("puts the most expensive task first and adds everything up", () => {
    const { tasks, total } = rollupCalls([
      group({ purpose: "cv-audit", calls: 2, reportedUsd: 0.02, reportedCalls: 2 }),
      group({ purpose: "web-search", reportedUsd: 0.1, webSearches: 3 }),
      group({ purpose: "cv-audit", model: "claude-sonnet-5-5", reportedUsd: 0.05 }),
    ])
    expect(tasks.map((task) => task.purpose)).toEqual(["web-search", "cv-audit"])
    expect(tasks[1]).toMatchObject({
      calls: 3,
      models: ["claude-haiku-5-5", "claude-sonnet-5-5"],
      tokenInput: 200,
    })
    expect(tasks[1].usd).toBeCloseTo(0.07)
    expect(total.calls).toBe(4)
    expect(total.webSearches).toBe(3)
    expect(total.usd).toBeCloseTo(0.17)
    expect(total.unknownCalls).toBe(0)
    expect(total.unpricedCalls).toBe(0)
  })

  it("counts runs without a report or a price apart and leaves their cost out", () => {
    const { total, tasks } = rollupCalls([
      group({
        usageKnown: false,
        tokenInput: 0,
        tokenOutput: 0,
        reportedUsd: null,
        reportedCalls: 0,
      }),
      group({ model: "unknown-model", provider: "openai", reportedUsd: null, reportedCalls: 0 }),
      group({ calls: 3, reportedUsd: 0.03, reportedCalls: 2 }),
    ])
    expect(total.calls).toBe(5)
    expect(total.unknownCalls).toBe(1)
    expect(total.unpricedCalls).toBe(2)
    expect(total.usd).toBeCloseTo(0.03)
    // A run without a report names only the model it asked for, so it is not listed.
    expect(tasks[0].models).toEqual(["unknown-model", "claude-haiku-5-5"])
  })

  it("prices an API key's model from the price table", () => {
    const usd = groupUsd(
      group({
        provider: "openai",
        model: "gpt-4o-mini",
        tokenInput: 1_000_000,
        tokenOutput: 1_000_000,
        reportedUsd: null,
        reportedCalls: 0,
      })
    )
    expect(usd).toBeCloseTo(0.75)
  })
})

describe("who sees the tab", () => {
  it("is every account on a local install and only an admin elsewhere", () => {
    expect(usageTabVisible("GUEST", true)).toBe(true)
    expect(usageTabVisible("USER", true)).toBe(true)
    expect(usageTabVisible("USER", false)).toBe(false)
    expect(usageTabVisible("ADMIN", false)).toBe(true)
    expect(usageTabVisible(undefined, false)).toBe(false)
  })
})
