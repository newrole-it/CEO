import db from "db"
import type { LlmCacheStore } from "@newrole/llm/common"

/**
 * Model replies kept in Postgres (LlmCache), shared by the web app and the MCP server. Personal prompts are stored only when tied to a user (shouldStoreLlmCache).
 */
export const prismaLlmCache: LlmCacheStore = {
  async read(cacheKey) {
    const cached = await db.llmCache.findUnique({ where: { cacheKey } })
    return cached?.response ?? null
  },
  async write(entry) {
    await db.llmCache.upsert({
      where: { cacheKey: entry.cacheKey },
      update: {
        response: entry.response,
        tokenInput: entry.tokenInput,
        tokenOutput: entry.tokenOutput,
        model: entry.model,
        purpose: entry.purpose,
        userId: entry.userId,
      },
      create: {
        cacheKey: entry.cacheKey,
        purpose: entry.purpose,
        model: entry.model,
        response: entry.response,
        tokenInput: entry.tokenInput,
        tokenOutput: entry.tokenOutput,
        userId: entry.userId,
      },
    })
  },
}
