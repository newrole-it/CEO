import { loadEnvConfig } from "@next/env"
import { resolve } from "path"
import "../src/server/http"

/**
 * Imported first by the lab's scripts: the repository root's .env, the lab's HTTP client for
 * @newrole/ats, and the database the engine may write to. That is never newrole.it's own:
 * JOBS_LAB_DATABASE_URL, or DATABASE_URL's database with "_lab" added.
 */
loadEnvConfig(resolve(__dirname, "../../.."), process.env.NODE_ENV !== "production", {
  info: () => undefined,
  error: (...args: unknown[]) => console.error(...args),
})

export function labDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.JOBS_LAB_DATABASE_URL?.trim()) return env.JOBS_LAB_DATABASE_URL.trim()
  if (!env.DATABASE_URL) return null
  const url = new URL(env.DATABASE_URL)
  const name = url.pathname.replace(/^\//, "") || "jobscanner"
  url.pathname = `/${name.endsWith("_lab") ? name : `${name}_lab`}`
  return url.toString()
}

/** newrole.it's schema: the engine's tables are its tables (packages/job-index/src/host.ts in this app). */
export const SCHEMA = resolve(__dirname, "../../resume-engine-optimization/db/schema.prisma")
