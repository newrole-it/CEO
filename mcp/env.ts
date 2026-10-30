import { loadEnvConfig } from "@next/env"
import { resolve } from "path"

/**
 * Imported first by the MCP server. Loads the repo's .env files the same way Next does,
 * and keeps stdout free for the MCP protocol: app modules that log go to stderr.
 */
export const REPO_ROOT = resolve(__dirname, "..")

loadEnvConfig(REPO_ROOT, process.env.NODE_ENV !== "production", {
  info: () => undefined,
  error: (...args: unknown[]) => console.error(...args),
})

const toStderr = (...args: unknown[]) => console.error(...args)
console.log = toStderr
console.info = toStderr
console.debug = toStderr
