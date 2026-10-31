import { describe, expect, it } from "vitest"
import {
  claudeSearch,
  claudeSearchDailyCap,
  claudeSearchEnabled,
  parseClaudeSearchOutput,
  type SearchCounter,
} from "./claude-search"

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv

describe("parseClaudeSearchOutput", () => {
  it("reads a fenced JSON array and drops bad rows", () => {
    const text = [
      "Here you go:",
      "```json",
      JSON.stringify([
        { url: "https://acme.pl/kariera", title: " Kariera  w Acme ", snippet: "Dołącz" },
        { url: "javascript:alert(1)", title: "bad" },
        { url: "not a url" },
        { url: "https://acme.pl/kariera", title: "duplicate" },
        { url: "https://job-boards.greenhouse.io/acme", description: "Greenhouse board" },
      ]),
      "```",
    ].join("\n")
    expect(parseClaudeSearchOutput(text)).toEqual([
      { url: "https://acme.pl/kariera", title: "Kariera w Acme", snippet: "Dołącz" },
      { url: "https://job-boards.greenhouse.io/acme", title: undefined, snippet: "Greenhouse board" },
    ])
  })

  it("accepts {results: [...]} and returns [] for prose", () => {
    expect(parseClaudeSearchOutput('{"results":[{"url":"https://a.io/"}]}')).toHaveLength(1)
    expect(parseClaudeSearchOutput("I could not find anything.")).toEqual([])
    expect(parseClaudeSearchOutput("[]")).toEqual([])
  })

  it("caps at ten hits", () => {
    const rows = Array.from({ length: 15 }, (_, i) => ({ url: `https://a${i}.io/` }))
    expect(parseClaudeSearchOutput(JSON.stringify(rows))).toHaveLength(10)
  })
})

describe("claude provider gating", () => {
  it("needs the env switch and the binary", () => {
    const found = () => "/usr/local/bin/claude"
    const missing = () => null
    expect(claudeSearchEnabled(env({ LLM_PROVIDER: "claude-cli" }), found)).toBe(true)
    expect(claudeSearchEnabled(env({ WEB_SEARCH_PROVIDER: "claude" }), found)).toBe(true)
    expect(claudeSearchEnabled(env({ LLM_PROVIDER: "claude-cli" }), missing)).toBe(false)
    expect(
      claudeSearchEnabled(env({ LLM_PROVIDER: "claude-cli", CLAUDE_SEARCH_DAILY_CAP: "0" }), found)
    ).toBe(false)
    expect(claudeSearchEnabled(env({}), found)).toBe(false)
    expect(claudeSearchDailyCap(env({}))).toBe(40)
    expect(claudeSearchDailyCap(env({ CLAUDE_SEARCH_DAILY_CAP: "3" }))).toBe(3)
    expect(claudeSearchDailyCap(env({ CLAUDE_SEARCH_DAILY_CAP: "x" }))).toBe(40)
  })

  it("runs claude with WebSearch only and stops at the daily cap", async () => {
    let used = 0
    const counter: SearchCounter = { take: async (cap) => used++ < Math.min(cap, 1) }
    const seen: Array<{ allowedTools?: string[]; prompt: string }> = []
    const run = async (args: { prompt: string; allowedTools?: string[] }) => {
      seen.push(args)
      return { text: '[{"url":"https://acme.pl/kariera","title":"Kariera"}]', tokenInput: 0, tokenOutput: 0 }
    }
    const hits = await claudeSearch('"Acme" kariera', { run, counter })
    expect(hits).toEqual([{ url: "https://acme.pl/kariera", title: "Kariera", snippet: undefined }])
    expect(seen[0]?.allowedTools).toEqual(["WebSearch"])
    expect(seen[0]?.prompt).toContain('"Acme" kariera')
    await expect(claudeSearch("again", { run, counter })).rejects.toThrow(/daily cap/)
    expect(seen).toHaveLength(1)
  })

  it("fails loudly when the CLI does not answer", async () => {
    const counter: SearchCounter = { take: async () => true }
    await expect(claudeSearch("q", { run: async () => null, counter })).rejects.toThrow(/did not answer/)
  })
})
