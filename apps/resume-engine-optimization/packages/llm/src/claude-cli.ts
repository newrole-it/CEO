import { spawn as nodeSpawn, type ChildProcessWithoutNullStreams } from "child_process"
import { accessSync, constants } from "fs"
import { homedir, tmpdir } from "os"
import { delimiter, join } from "path"
import type { z } from "zod"
import {
  cachePlan,
  readCachedJson,
  readCachedText,
  stripFences,
  UNTRUSTED_RULE,
  writeCache,
  type LlmCacheStore,
  type LlmClient,
  type LlmResult,
} from "./common"
import { readCliUsage, type LlmCallUsage, type RecordLlmCall } from "./usage"

/**
 * LLM provider that runs the local `claude` CLI in print mode, so the person's own
 * Claude subscription does the work. No API key, no network code of ours.
 */

export type SpawnFn = (
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; stdio?: ["pipe", "pipe", "pipe"] }
) => ChildProcessWithoutNullStreams

export type ClaudeRunArgs = {
  /** The task, as the AI usage tab names it (LlmCall.purpose) */
  purpose?: string
  prompt: string
  system?: string
  model?: string
  allowedTools?: string[]
  timeoutMs?: number
  maxTurns?: number
  /** Connects the Claude in Chrome extension. Its tools are named mcp__claude-in-chrome__*. */
  chrome?: boolean
  /** Streams tool calls and results as they happen (stream-json). The final result is the same. */
  onEvent?: (event: ClaudeStreamEvent) => void
}

export type ClaudeStreamEvent =
  | { kind: "tool_use"; name: string; input: Record<string, unknown> }
  | { kind: "tool_result"; text: string; isError: boolean }

export type ClaudeRunResult = {
  text: string
  costUsd?: number
  tokenInput: number
  tokenOutput: number
}

export type ClaudeCliDeps = {
  spawn?: SpawnFn
  binary?: string | null
  /** Where each run's usage goes; without one it is not kept */
  record?: RecordLlmCall | null
}

export const DEFAULT_CLAUDE_MODEL = "haiku"
export const DEFAULT_TIMEOUT_MS = 90_000
export const DEFAULT_MAX_CONCURRENT = 2
/** Bulk index work stays on rules unless CLAUDE_CLI_SKIP_PURPOSES says otherwise. */
export const DEFAULT_SKIPPED_PURPOSES = ["role-classify"]

const JSON_ONLY = "Reply with exactly one JSON object. No prose, no markdown, no code fences."

let cachedBinary: string | null | undefined

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/** CLAUDE_CLI_PATH, then `claude` on PATH, then the default installer location. */
export type Env = Record<string, string | undefined>

export function findClaudeBinary(env: Env = process.env): string | null {
  const explicit = env.CLAUDE_CLI_PATH?.trim()
  if (explicit) return executable(explicit) ? explicit : null
  if (env === process.env && cachedBinary !== undefined) return cachedBinary
  const dirs = (env.PATH || "").split(delimiter).filter(Boolean)
  dirs.push(join(homedir(), ".local", "bin"), join(homedir(), ".claude", "local"))
  const found = dirs.map((dir) => join(dir, "claude")).find(executable) ?? null
  // Only a hit is cached: Claude Code installed while the app runs must work without a restart.
  if (env === process.env && found) cachedBinary = found
  return found
}

/** Small FIFO semaphore shared by every client in the process. */
export function createLimiter(max: number) {
  let active = 0
  const waiting: (() => void)[] = []
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve))
    active += 1
    try {
      return await task()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}

const limiters = new Map<number, ReturnType<typeof createLimiter>>()

function limiterFor(max: number) {
  const size = Math.max(1, Math.floor(max) || DEFAULT_MAX_CONCURRENT)
  let limiter = limiters.get(size)
  if (!limiter) {
    limiter = createLimiter(size)
    limiters.set(size, limiter)
  }
  return limiter
}

function cliModel(args: ClaudeRunArgs): string {
  return args.model || process.env.CLAUDE_CLI_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
}

export function claudeArgs(args: ClaudeRunArgs): string[] {
  const tools = args.allowedTools ?? []
  // --tools lists built-in tools only. MCP tools (Chrome) are allowed by name alone.
  const builtIn = tools.filter((tool) => !tool.startsWith("mcp__"))
  const list = [
    "-p",
    "--output-format",
    ...(args.onEvent ? ["stream-json", "--verbose"] : ["json"]),
    "--model",
    cliModel(args),
    "--max-turns",
    String(args.maxTurns ?? (tools.length ? 8 : 1)),
    // Only the named built-in tools exist in the session; "" means none at all.
    "--tools",
    builtIn.join(","),
    // Strict still leaves the Chrome extension's tools when --chrome is on (checked by hand).
    "--strict-mcp-config",
    "--no-session-persistence",
  ]
  if (args.chrome) list.push("--chrome")
  if (tools.length) list.push("--allowedTools", tools.join(","))
  if (args.system) list.push("--system-prompt", args.system)
  return list
}

type CliPayload = {
  result?: unknown
  is_error?: boolean
  total_cost_usd?: number
  usage?: {
    input_tokens?: number
    output_tokens?: number
    cache_creation_input_tokens?: number
    cache_read_input_tokens?: number
  }
}

/** Events from one stream-json line, and the final result line when it is one. */
export function readStreamLine(line: string): { events: ClaudeStreamEvent[]; result?: string } {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(line) as Record<string, unknown>
  } catch {
    return { events: [] }
  }
  if (payload.type === "result") return { events: [], result: line }
  const message = payload.message as { content?: unknown } | undefined
  if (!Array.isArray(message?.content)) return { events: [] }
  const events: ClaudeStreamEvent[] = []
  for (const item of message!.content as Record<string, unknown>[]) {
    if (payload.type === "assistant" && item.type === "tool_use" && typeof item.name === "string") {
      const input = item.input && typeof item.input === "object" ? item.input : {}
      events.push({ kind: "tool_use", name: item.name, input: input as Record<string, unknown> })
    } else if (payload.type === "user" && item.type === "tool_result") {
      const content = item.content
      const text = Array.isArray(content)
        ? content
            .map((part) =>
              part && typeof part === "object" ? (part as { text?: unknown }).text : ""
            )
            .filter((part): part is string => typeof part === "string")
            .join("\n")
        : typeof content === "string"
        ? content
        : ""
      events.push({ kind: "tool_result", text, isError: item.is_error === true })
    }
  }
  return { events }
}

/** Parses the single JSON object `claude -p --output-format json` prints. */
export function parseCliOutput(stdout: string): ClaudeRunResult | null {
  let payload: CliPayload
  try {
    payload = JSON.parse(stdout.trim()) as CliPayload
  } catch {
    return null
  }
  if (!payload || payload.is_error || typeof payload.result !== "string") return null
  const usage = payload.usage ?? {}
  return {
    text: payload.result,
    costUsd: typeof payload.total_cost_usd === "number" ? payload.total_cost_usd : undefined,
    tokenInput:
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0),
    tokenOutput: usage.output_tokens ?? 0,
  }
}

type RunOutcome = { reply: ClaudeRunResult | null; usage: LlmCallUsage | null }

function runOnce(
  binary: string,
  args: ClaudeRunArgs,
  spawn: SpawnFn,
  timeoutMs: number
): Promise<RunOutcome> {
  return new Promise((resolve) => {
    let child: ChildProcessWithoutNullStreams
    try {
      // Args array, never a shell. tmpdir keeps project CLAUDE.md files out of the prompt.
      child = spawn(binary, claudeArgs(args), {
        cwd: tmpdir(),
        env: process.env,
        stdio: ["pipe", "pipe", "pipe"],
      })
    } catch (error) {
      console.error("claude CLI failed to start", error instanceof Error ? error.message : error)
      resolve({ reply: null, usage: null })
      return
    }
    let stdout = ""
    let stderr = ""
    let pending = ""
    let resultLine: string | null = null
    let settled = false
    const consume = (chunk: string, flush = false) => {
      pending += chunk
      const lines = pending.split("\n")
      pending = flush ? "" : lines.pop() ?? ""
      for (const line of lines) {
        if (!line.trim()) continue
        const read = readStreamLine(line)
        if (read.result) resultLine = read.result
        for (const event of read.events) {
          try {
            args.onEvent?.(event)
          } catch {
            // A listener error must not kill the run.
          }
        }
      }
    }
    const finish = (value: RunOutcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      console.error(`claude CLI timed out after ${timeoutMs} ms`)
      child.kill("SIGTERM")
      setTimeout(() => child.kill("SIGKILL"), 2000).unref()
      finish({ reply: null, usage: null })
    }, timeoutMs)
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8")
      if (args.onEvent) consume(text)
      else stdout += text
    })
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString("utf8")))
    child.on("error", (error) => {
      console.error("claude CLI failed", error.message)
      finish({ reply: null, usage: null })
    })
    child.on("close", (code) => {
      if (args.onEvent) {
        consume("", true)
        stdout = resultLine ?? ""
      }
      const parsed = parseCliOutput(stdout)
      if (!parsed) {
        console.error(
          `claude CLI exited ${code}${stderr ? `: ${stderr.trim().slice(0, 300)}` : ""}`
        )
      }
      finish({ reply: parsed, usage: readCliUsage(stdout) })
    })
    child.stdin.on("error", () => undefined)
    child.stdin.end(args.prompt)
  })
}

/**
 * One headless Claude turn. Tools are off unless `allowedTools` names them
 * (discovery passes ["WebSearch"]). Returns null when the CLI is missing or fails.
 * Every run that starts goes to `deps.record`, failed ones too.
 */
export async function runClaudePrompt(
  args: ClaudeRunArgs,
  deps: ClaudeCliDeps & { maxConcurrent?: number } = {}
): Promise<ClaudeRunResult | null> {
  const binary = deps.binary === undefined ? findClaudeBinary() : deps.binary
  if (!binary) return null
  const timeoutMs =
    args.timeoutMs ?? (Number(process.env.CLAUDE_CLI_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS)
  const max =
    deps.maxConcurrent ?? (Number(process.env.CLAUDE_CLI_MAX_CONCURRENT) || DEFAULT_MAX_CONCURRENT)
  const run = await limiterFor(max)(async () => {
    const started = Date.now()
    const outcome = await runOnce(binary, args, deps.spawn ?? nodeSpawn, timeoutMs)
    return { ...outcome, durationMs: Date.now() - started }
  })
  await deps.record?.({
    purpose: args.purpose || "other",
    provider: "claude-cli",
    tokenInput: 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenOutput: 0,
    webSearches: 0,
    reportedUsd: null,
    ...run.usage,
    model: run.usage?.model || cliModel(args),
    usageKnown: run.usage != null,
    durationMs: run.durationMs,
  })
  return run.reply
}

/** First balanced JSON object or array in a reply that may carry prose around it. */
export function extractJson(text: string): unknown {
  const stripped = stripFences(text)
  try {
    return JSON.parse(stripped)
  } catch {
    // fall through
  }
  const start = stripped.search(/[{[]/)
  if (start < 0) return undefined
  const open = stripped[start]
  const close = open === "{" ? "}" : "]"
  let depth = 0
  let inString = false
  for (let i = start; i < stripped.length; i += 1) {
    const char = stripped[i]
    if (inString) {
      if (char === "\\") i += 1
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') inString = true
    else if (char === open) depth += 1
    else if (char === close) {
      depth -= 1
      if (depth === 0) {
        try {
          return JSON.parse(stripped.slice(start, i + 1))
        } catch {
          return undefined
        }
      }
    }
  }
  return undefined
}

function skippedPurposes(): Set<string> {
  const raw = process.env.CLAUDE_CLI_SKIP_PURPOSES
  if (raw == null) return new Set(DEFAULT_SKIPPED_PURPOSES)
  return new Set(
    raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )
}

export function createClaudeCliClient(
  opts: {
    model?: string
    timeoutMs?: number
    maxConcurrent?: number
    /** Where replies are kept between calls; without one every call runs claude */
    cache?: LlmCacheStore | null
  } & ClaudeCliDeps = {}
): LlmClient {
  const store = opts.cache ?? null
  const model = opts.model || process.env.CLAUDE_CLI_MODEL?.trim() || DEFAULT_CLAUDE_MODEL
  const cacheModel = `claude-cli/${model}`
  const run = (purpose: string, prompt: string, system: string) =>
    runClaudePrompt(
      { purpose, prompt, system, model, timeoutMs: opts.timeoutMs },
      {
        spawn: opts.spawn,
        binary: opts.binary,
        maxConcurrent: opts.maxConcurrent,
        record: opts.record,
      }
    )

  return {
    model: cacheModel,
    async completeJson<T>(args: {
      purpose: string
      system: string
      user: string
      schema: z.ZodType<T>
      maxTokens?: number
      userId?: number
    }): Promise<LlmResult<T> | null> {
      if (skippedPurposes().has(args.purpose)) return null
      const system = `${args.system}\n${UNTRUSTED_RULE}\n${JSON_ONLY}`
      const cache = store && cachePlan(args.purpose, cacheModel, system, args.user, args.userId)
      if (store && cache) {
        const hit = await readCachedJson(store, cache.cacheKey, args.schema)
        if (hit) return hit
      }
      let tokenInput = 0
      let tokenOutput = 0
      let prompt = args.user
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const reply = await run(args.purpose, prompt, system)
        if (!reply) return null
        tokenInput += reply.tokenInput
        tokenOutput += reply.tokenOutput
        const parsed = args.schema.safeParse(extractJson(reply.text))
        if (parsed.success) {
          if (store && cache) {
            await writeCache(store, {
              cacheKey: cache.cacheKey,
              purpose: args.purpose,
              model: cacheModel,
              response: parsed.data as object,
              tokenInput,
              tokenOutput,
              userId: cache.userId,
            })
          }
          return { data: parsed.data, tokenInput, tokenOutput, cached: false }
        }
        prompt = `${args.user}\n\nYour previous reply did not match the required JSON shape. ${JSON_ONLY}`
      }
      console.error(`claude CLI ${args.purpose} returned invalid JSON twice`)
      return null
    },
    async completeText(args): Promise<LlmResult<string> | null> {
      if (skippedPurposes().has(args.purpose)) return null
      const system = `${args.system}\n${UNTRUSTED_RULE}`
      const cache = store && cachePlan(args.purpose, cacheModel, system, args.user, args.userId)
      if (store && cache) {
        const hit = await readCachedText(store, cache.cacheKey)
        if (hit) return hit
      }
      const reply = await run(args.purpose, args.user, system)
      if (!reply?.text.trim()) return null
      if (store && cache) {
        await writeCache(store, {
          cacheKey: cache.cacheKey,
          purpose: args.purpose,
          model: cacheModel,
          response: { text: reply.text },
          tokenInput: reply.tokenInput,
          tokenOutput: reply.tokenOutput,
          userId: cache.userId,
        })
      }
      return {
        data: reply.text,
        tokenInput: reply.tokenInput,
        tokenOutput: reply.tokenOutput,
        cached: false,
      }
    },
  }
}
