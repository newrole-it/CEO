import type { z } from "zod"
import { createClaudeCliClient, findClaudeBinary, type Env } from "./claude-cli"
import {
  cachePlan,
  readCachedJson,
  readCachedText,
  stripFences,
  UNTRUSTED_RULE,
  writeCache,
  type CachePlan,
  type LlmCacheStore,
  type LlmClient,
  type LlmResult,
} from "./common"
import type { RecordLlmCall } from "./usage"

export {
  hashCacheKey,
  isPersonalLlmPurpose,
  PERSONAL_LLM_PURPOSES,
  shouldStoreLlmCache,
  stripFences,
  UNTRUSTED_RULE,
  wrapUntrusted,
} from "./common"
export type { LlmCacheEntry, LlmCacheStore, LlmClient, LlmResult } from "./common"
export type { LlmCallRecord, RecordLlmCall } from "./usage"

export type LlmClientOptions = {
  /** Where replies are kept between calls; without one every call goes to the model */
  cache?: LlmCacheStore | null
  /** Where each run's usage goes; without one it is not kept */
  record?: RecordLlmCall | null
}

export type LlmProvider = "openai" | "claude-cli" | "none"

function cost(tokenInput: number, tokenOutput: number): number {
  const inputRate = Number(process.env.LLM_INPUT_USD_PER_MILLION || 0)
  const outputRate = Number(process.env.LLM_OUTPUT_USD_PER_MILLION || 0)
  return (tokenInput / 1_000_000) * inputRate + (tokenOutput / 1_000_000) * outputRate
}

export function estimateCost(tokenInput: number, tokenOutput: number): number {
  return cost(tokenInput, tokenOutput)
}

/**
 * LLM_PROVIDER wins when set. Otherwise a `claude` binary means claude-cli (the person's own
 * Claude subscription), so a key left in the environment cannot send their CV to an API. An API
 * key counts only without the binary, and nothing means none.
 */
export function llmProvider(
  env: Env = process.env,
  hasClaude: () => boolean = () => findClaudeBinary(env) != null
): LlmProvider {
  const explicit = env.LLM_PROVIDER?.trim().toLowerCase()
  const hasKey = Boolean(env.LLM_API_KEY?.trim())
  if (explicit === "none" || explicit === "off") return "none"
  if (explicit === "openai") return hasKey ? "openai" : "none"
  if (explicit === "claude-cli" || explicit === "claude") return hasClaude() ? "claude-cli" : "none"
  if (hasClaude()) return "claude-cli"
  return hasKey ? "openai" : "none"
}

export function createLlmClient(opts: LlmClientOptions = {}): LlmClient | null {
  const provider = llmProvider()
  if (provider === "claude-cli")
    return createClaudeCliClient({ cache: opts.cache, record: opts.record })
  if (provider === "openai") return createOpenAiClient(opts)
  return null
}

type OpenAiUsage = { prompt_tokens?: number; completion_tokens?: number }

/** Hands one answered request to `record`. The host prices it from the token counts. */
async function recordOpenAi(
  record: RecordLlmCall | null | undefined,
  purpose: string,
  model: string,
  usage: OpenAiUsage | undefined,
  started: number
) {
  await record?.({
    purpose,
    provider: "openai",
    model,
    tokenInput: usage?.prompt_tokens ?? 0,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
    tokenOutput: usage?.completion_tokens ?? 0,
    webSearches: 0,
    reportedUsd: null,
    usageKnown: usage != null,
    durationMs: Date.now() - started,
  })
}

export function createOpenAiClient(opts: LlmClientOptions = {}): LlmClient | null {
  const store = opts.cache ?? null
  const apiKey = process.env.LLM_API_KEY?.trim()
  const model = process.env.LLM_MODEL?.trim() || "gpt-4o-mini"
  const baseUrl = (process.env.LLM_BASE_URL?.trim() || "https://api.openai.com/v1").replace(
    /\/$/,
    ""
  )
  if (!apiKey) return null

  return {
    model,
    async completeJson<T>(args: {
      purpose: string
      system: string
      user: string
      schema: z.ZodType<T>
      maxTokens?: number
      userId?: number
      timeoutMs?: number
    }): Promise<LlmResult<T> | null> {
      const system = `${args.system}\n${UNTRUSTED_RULE}`
      const cache = store && cachePlan(args.purpose, model, system, args.user, args.userId)
      if (store && cache) {
        const hit = await readCachedJson(store, cache.cacheKey, args.schema)
        if (hit) return hit
      }

      const body = {
        model,
        temperature: 0,
        max_tokens: args.maxTokens ?? 700,
        messages: [
          { role: "system", content: system },
          { role: "user", content: args.user },
        ],
      }
      const call = async (withFormat: boolean) => {
        const response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(
            withFormat ? { ...body, response_format: { type: "json_object" } } : body
          ),
          signal: AbortSignal.timeout(args.timeoutMs ?? 30_000),
        })
        return response
      }

      let response: Response
      const started = Date.now()
      try {
        response = await call(true)
        if (response.status === 400) response = await call(false)
      } catch (error) {
        console.error(`LLM ${args.purpose} failed`, error instanceof Error ? error.message : error)
        return null
      }
      if (!response.ok) {
        console.error(`LLM ${args.purpose} HTTP ${response.status}`)
        return null
      }
      let payload: {
        choices?: Array<{ message?: { content?: string } }>
        usage?: OpenAiUsage
      }
      try {
        payload = (await response.json()) as typeof payload
      } catch (error) {
        console.error(
          `LLM ${args.purpose} returned invalid JSON`,
          error instanceof Error ? error.message : error
        )
        return null
      }
      await recordOpenAi(opts.record, args.purpose, model, payload.usage, started)
      const content = payload.choices?.[0]?.message?.content
      if (!content) return null
      let json: unknown
      try {
        json = JSON.parse(stripFences(content))
      } catch {
        return null
      }
      const parsed = args.schema.safeParse(json)
      if (!parsed.success) return null
      const tokenInput = payload.usage?.prompt_tokens ?? 0
      const tokenOutput = payload.usage?.completion_tokens ?? 0
      if (store && cache) {
        await writeCache(store, {
          cacheKey: cache.cacheKey,
          purpose: args.purpose,
          model,
          response: parsed.data as object,
          tokenInput,
          tokenOutput,
          userId: cache.userId,
        })
      }
      return { data: parsed.data, tokenInput, tokenOutput, cached: false }
    },
    async completeText(args): Promise<LlmResult<string> | null> {
      const system = `${args.system}\n${UNTRUSTED_RULE}`
      const cache = store && cachePlan(args.purpose, model, system, args.user, args.userId)
      if (store && cache) {
        const hit = await readCachedText(store, cache.cacheKey)
        if (hit) return hit
      }
      const send = (withFormat: boolean) =>
        fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: args.maxTokens ?? 1200,
            ...(withFormat ? { response_format: { type: "json_object" } } : {}),
            messages: [
              { role: "system", content: system },
              { role: "user", content: args.user },
            ],
          }),
          signal: AbortSignal.timeout(30_000),
        })
      let response: Response
      const started = Date.now()
      try {
        response = await send(true)
        if (response.status === 400) response = await send(false)
      } catch (error) {
        console.error(`LLM ${args.purpose} failed`, error instanceof Error ? error.message : error)
        return null
      }
      if (!response.ok) {
        console.error(`LLM ${args.purpose} HTTP ${response.status}`)
        return null
      }
      return storeText(response, store, cache, args.purpose, model, opts.record, started)
    },
  }
}

async function storeText(
  response: Response,
  store: LlmCacheStore | null,
  cache: CachePlan | null,
  purpose: string,
  model: string,
  record: RecordLlmCall | null | undefined,
  started: number
): Promise<LlmResult<string> | null> {
  let payload: {
    choices?: Array<{ message?: { content?: string } }>
    usage?: OpenAiUsage
  }
  try {
    payload = (await response.json()) as typeof payload
  } catch (error) {
    console.error(
      `LLM ${purpose} returned invalid JSON`,
      error instanceof Error ? error.message : error
    )
    return null
  }
  await recordOpenAi(record, purpose, model, payload.usage, started)
  const text = payload.choices?.[0]?.message?.content
  if (!text) return null
  const tokenInput = payload.usage?.prompt_tokens ?? 0
  const tokenOutput = payload.usage?.completion_tokens ?? 0
  if (store && cache) {
    await writeCache(store, {
      cacheKey: cache.cacheKey,
      purpose,
      model,
      response: { text },
      tokenInput,
      tokenOutput,
      userId: cache.userId,
    })
  }
  return { data: text, tokenInput, tokenOutput, cached: false }
}
