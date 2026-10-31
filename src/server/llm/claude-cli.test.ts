import { EventEmitter } from "events"
import { describe, expect, it } from "vitest"
import { z } from "zod"
import {
  claudeArgs,
  createClaudeCliClient,
  createLimiter,
  extractJson,
  parseCliOutput,
  runClaudePrompt,
  type SpawnFn,
} from "./claude-cli"
import { llmProvider } from "./client"

type Call = { command: string; args: string[]; stdin: string }

/** A spawn stand-in that answers each call with the next scripted reply. */
function fakeSpawn(replies: (string | { stdout?: string; code?: number; hang?: boolean })[]) {
  const calls: Call[] = []
  const spawn = ((command: string, args: string[]) => {
    const reply = replies[calls.length] ?? replies[replies.length - 1]
    const step = typeof reply === "string" ? { stdout: reply, code: 0 } : reply
    const call: Call = { command, args, stdin: "" }
    calls.push(call)
    const child = new EventEmitter() as EventEmitter & Record<string, unknown>
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    child.kill = () => {
      child.emit("close", null)
      return true
    }
    child.stdin = {
      on: () => undefined,
      end: (input: string) => {
        call.stdin = input
        if (step.hang) return
        setTimeout(() => {
          ;(child.stdout as EventEmitter).emit("data", Buffer.from(step.stdout ?? ""))
          child.emit("close", step.code ?? 0)
        }, 1)
      },
    }
    return child
  }) as unknown as SpawnFn
  return { spawn, calls }
}

function cliJson(result: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "result",
    is_error: false,
    result,
    total_cost_usd: 0.0005,
    usage: { input_tokens: 3, cache_creation_input_tokens: 100, output_tokens: 12 },
    ...extra,
  })
}

const schema = z.object({ title: z.string(), years: z.number() })

describe("claude CLI arguments", () => {
  it("disables every tool by default and never needs a shell", () => {
    const args = claudeArgs({ prompt: "x", system: "sys", model: "haiku" })
    expect(args.slice(0, 3)).toEqual(["-p", "--output-format", "json"])
    expect(args[args.indexOf("--tools") + 1]).toBe("")
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1")
    expect(args).toContain("--strict-mcp-config")
    expect(args).not.toContain("--allowedTools")
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("sys")
  })

  it("allows only the named tools for discovery", () => {
    const args = claudeArgs({ prompt: "x", allowedTools: ["WebSearch"] })
    expect(args[args.indexOf("--tools") + 1]).toBe("WebSearch")
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("WebSearch")
    expect(Number(args[args.indexOf("--max-turns") + 1])).toBeGreaterThan(1)
  })

  it("connects Chrome and allows its tools without listing them as built-ins", () => {
    const tool = "mcp__claude-in-chrome__get_page_text"
    const args = claudeArgs({ prompt: "x", chrome: true, allowedTools: [tool], maxTurns: 25 })
    expect(args).toContain("--chrome")
    expect(args).toContain("--strict-mcp-config")
    expect(args[args.indexOf("--tools") + 1]).toBe("")
    expect(args[args.indexOf("--allowedTools") + 1]).toBe(tool)
    expect(args[args.indexOf("--max-turns") + 1]).toBe("25")
    expect(claudeArgs({ prompt: "x" })).not.toContain("--chrome")
  })
})

describe("claude CLI output", () => {
  it("reads result, cost and token usage", () => {
    expect(parseCliOutput(cliJson("hi"))).toEqual({
      text: "hi",
      costUsd: 0.0005,
      tokenInput: 103,
      tokenOutput: 12,
    })
  })

  it("rejects errors and garbage", () => {
    expect(parseCliOutput(cliJson("x", { is_error: true }))).toBeNull()
    expect(parseCliOutput("not json")).toBeNull()
  })

  it("finds JSON inside fences or prose", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('Sure! {"a":"}{"} done')).toEqual({ a: "}{" })
    expect(extractJson("nothing")).toBeUndefined()
  })
})

describe("claude CLI client", () => {
  it("sends the prompt on stdin and validates the reply", async () => {
    const { spawn, calls } = fakeSpawn([cliJson('{"title":"CTO","years":12}')])
    const client = createClaudeCliClient({ spawn, binary: "/bin/claude" })
    const result = await client.completeJson({
      purpose: "candidate-profile",
      system: "Extract.",
      user: "<untrusted_cv>CV</untrusted_cv>",
      schema,
    })
    expect(result?.data).toEqual({ title: "CTO", years: 12 })
    expect(result?.tokenOutput).toBe(12)
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("/bin/claude")
    expect(calls[0].stdin).toContain("untrusted_cv")
    const system = calls[0].args[calls[0].args.indexOf("--system-prompt") + 1]
    expect(system).toContain("untrusted data")
  })

  it("retries once when the reply is not valid JSON", async () => {
    const { spawn, calls } = fakeSpawn([
      cliJson("I think the title is CTO"),
      cliJson('{"title":"CTO","years":3}'),
    ])
    const client = createClaudeCliClient({ spawn, binary: "/bin/claude" })
    const result = await client.completeJson({
      purpose: "candidate-profile",
      system: "s",
      user: "u",
      schema,
    })
    expect(result?.data.years).toBe(3)
    expect(calls).toHaveLength(2)
    expect(calls[1].stdin).toContain("did not match")
  })

  it("gives up after the retry", async () => {
    const { spawn, calls } = fakeSpawn([cliJson('{"title":1}')])
    const client = createClaudeCliClient({ spawn, binary: "/bin/claude" })
    const result = await client.completeJson({
      purpose: "candidate-profile",
      system: "s",
      user: "u",
      schema,
    })
    expect(result).toBeNull()
    expect(calls).toHaveLength(2)
  })

  it("skips bulk purposes so indexing does not burn the subscription", async () => {
    const { spawn, calls } = fakeSpawn([cliJson("{}")])
    const client = createClaudeCliClient({ spawn, binary: "/bin/claude" })
    const result = await client.completeJson({
      purpose: "role-classify",
      system: "s",
      user: "u",
      schema: z.object({}),
    })
    expect(result).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it("times out a hung process", async () => {
    const { spawn } = fakeSpawn([{ hang: true }])
    const result = await runClaudePrompt(
      { prompt: "p", timeoutMs: 20 },
      { spawn, binary: "/bin/claude" }
    )
    expect(result).toBeNull()
  })

  it("returns null when the binary is missing", async () => {
    const { spawn, calls } = fakeSpawn([cliJson("x")])
    expect(await runClaudePrompt({ prompt: "p" }, { spawn, binary: null })).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe("limiter", () => {
  it("runs at most N tasks at once", async () => {
    const limit = createLimiter(2)
    let active = 0
    let peak = 0
    const task = () =>
      limit(async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
      })
    await Promise.all([task(), task(), task(), task(), task()])
    expect(peak).toBe(2)
  })
})

describe("provider selection", () => {
  const yes = () => true
  const no = () => false
  it("prefers the claude binary, then an API key, then nothing", () => {
    expect(llmProvider({ LLM_API_KEY: "k" }, yes)).toBe("claude-cli")
    expect(llmProvider({ LLM_API_KEY: "k" }, no)).toBe("openai")
    expect(llmProvider({}, yes)).toBe("claude-cli")
    expect(llmProvider({}, no)).toBe("none")
  })

  it("honours LLM_PROVIDER", () => {
    expect(llmProvider({ LLM_PROVIDER: "claude-cli", LLM_API_KEY: "k" }, yes)).toBe("claude-cli")
    expect(llmProvider({ LLM_PROVIDER: "none" }, yes)).toBe("none")
    expect(llmProvider({ LLM_PROVIDER: "openai", LLM_API_KEY: "k" }, yes)).toBe("openai")
    expect(llmProvider({ LLM_PROVIDER: "openai" }, yes)).toBe("none")
    expect(llmProvider({ LLM_PROVIDER: "claude-cli" }, no)).toBe("none")
  })

  it("never falls back to an API key when Claude is asked for and missing", () => {
    expect(llmProvider({ LLM_PROVIDER: "claude-cli", LLM_API_KEY: "k" }, no)).toBe("none")
  })
})
