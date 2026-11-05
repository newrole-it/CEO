import { describe, expect, it } from "vitest"
import {
  estimateModelUsd,
  estimatePln,
  priceForModel,
  rollupLlmUsage,
  USD_TO_PLN_ESTIMATE,
} from "./prices"

describe("LLM price table", () => {
  it("prices gpt-4o-mini and a dated snapshot, and leaves an unknown model unpriced", () => {
    expect(estimateModelUsd("gpt-4o-mini", 1_000_000, 0)).toBe(0.15)
    expect(estimateModelUsd("gpt-4o-mini", 0, 1_000_000)).toBe(0.6)
    expect(priceForModel("gpt-4o-mini-2024-07-18")).toEqual({ input: 0.15, output: 0.6 })
    expect(estimateModelUsd("claude-something", 100, 100)).toBeNull()
    expect(estimatePln(0.15)).toBeCloseTo(0.15 * USD_TO_PLN_ESTIMATE)
  })

  it("rolls known tasks up from stored calls and keeps zeros when nothing ran", () => {
    const empty = rollupLlmUsage([])
    expect(empty.tasks.find((task) => task.purpose === "role-classify")).toMatchObject({
      calls: 0,
      tokenInput: 0,
      usd: 0,
    })
    expect(empty.totalUsd).toBe(0)
    expect(empty.unpriced).toBe(false)

    const used = rollupLlmUsage([
      {
        purpose: "match-explanation",
        model: "gpt-4o-mini",
        calls: 2,
        tokenInput: 1_000_000,
        tokenOutput: 0,
      },
    ])
    expect(used.tasks.find((task) => task.purpose === "match-explanation")?.usd).toBe(0.15)
    expect(used.totalUsd).toBe(0.15)
  })

  it("does not invent a dollar figure for a model outside the table", () => {
    const rolled = rollupLlmUsage([
      { purpose: "job-industry", model: "local-model", calls: 1, tokenInput: 10, tokenOutput: 10 },
    ])
    expect(rolled.tasks.find((task) => task.purpose === "job-industry")?.usd).toBeNull()
    expect(rolled.unpriced).toBe(true)
    expect(rolled.totalUsd).toBeNull()
  })
})
