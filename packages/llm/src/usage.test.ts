import { describe, expect, it } from "vitest"
import { readCliUsage } from "./usage"

describe("reading claude -p usage", () => {
  it("sums modelUsage, which covers every model call of the run", () => {
    const usage = readCliUsage(
      JSON.stringify({
        total_cost_usd: 0.03,
        usage: { input_tokens: 2, output_tokens: 4 },
        modelUsage: {
          "claude-sonnet-5-5": {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadInputTokens: 300,
            cacheCreationInputTokens: 40,
            webSearchRequests: 2,
            costUSD: 0.02,
          },
          "claude-haiku-5-5": { inputTokens: 1, outputTokens: 1, costUSD: 0.01 },
        },
      })
    )
    expect(usage).toEqual({
      model: "claude-sonnet-5-5, claude-haiku-5-5",
      tokenInput: 11,
      cacheWriteTokens: 40,
      cacheReadTokens: 300,
      tokenOutput: 6,
      webSearches: 2,
      reportedUsd: 0.03,
    })
  })

  it("falls back to the usage block and to the per-model cost", () => {
    expect(
      readCliUsage(
        JSON.stringify({
          usage: {
            input_tokens: 3,
            cache_creation_input_tokens: 100,
            cache_read_input_tokens: 7,
            output_tokens: 12,
            server_tool_use: { web_search_requests: 1 },
          },
        })
      )
    ).toEqual({
      model: "",
      tokenInput: 3,
      cacheWriteTokens: 100,
      cacheReadTokens: 7,
      tokenOutput: 12,
      webSearches: 1,
      reportedUsd: null,
    })
    expect(
      readCliUsage(JSON.stringify({ modelUsage: { m: { inputTokens: 1, costUSD: 0.5 } } }))
        ?.reportedUsd
    ).toBe(0.5)
  })

  it("returns null without a usage report", () => {
    expect(readCliUsage("")).toBeNull()
    expect(readCliUsage("not json")).toBeNull()
    expect(readCliUsage(JSON.stringify({ result: "x" }))).toBeNull()
  })
})
