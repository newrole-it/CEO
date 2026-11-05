import type { PrismaClient } from "@newrole/jobs-lab-db"
import { createLlmClient, type LlmClient } from "@newrole/llm/client"
import {
  runClaudePrompt,
  type ClaudeCliDeps,
  type ClaudeRunArgs,
  type ClaudeRunResult,
} from "@newrole/llm/claude-cli"

/**
 * What the engine takes from the app that runs it. The index lives in Postgres, in the tables of
 * newrole.it's schema (apps/resume-engine-optimization/db/schema.prisma: Company, CareerPage, Job, JobObservation,
 * SearchRun, CatalogBoard, BackgroundTask…), through the Prisma client the app binds here. Model
 * calls go through the app's client so its cache and usage log see them. Reading the boards
 * themselves goes through @newrole/ats, which the app configures on its own (configureAts).
 */
export type JobIndexHost = {
  db: PrismaClient
  /** The app's model client, or null without a model. */
  llm: () => LlmClient | null
  /** One headless Claude turn for web search and company suggestions. */
  runClaudePrompt: (
    args: ClaudeRunArgs,
    deps?: ClaudeCliDeps & { maxConcurrent?: number }
  ) => Promise<ClaudeRunResult | null>
  /** A sign of life of the worker, for the app's status page. */
  heartbeat: (service: "worker") => Promise<void>
}

let current: JobIndexHost | null = null

/** Called once by the app at start; only `db` is required. */
export function configureJobIndex(
  next: Pick<JobIndexHost, "db"> & Partial<Omit<JobIndexHost, "db">>
): void {
  current = {
    llm: () => createLlmClient(),
    runClaudePrompt: (args, deps) => runClaudePrompt(args, deps),
    heartbeat: async () => undefined,
    ...next,
  }
}

export function jobIndexHost(): JobIndexHost {
  if (!current) {
    throw new Error("@newrole/job-index: call configureJobIndex({ db }) before using the index")
  }
  return current
}
