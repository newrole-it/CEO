import { loadEnvConfig } from "@next/env"
import { resolve } from "path"

/**
 * Imported first by code that runs outside Next (the worker, the seed, scripts): the .env files in
 * the repository root, read the same way Next reads them. Variables set in the shell still win.
 */
loadEnvConfig(resolve(__dirname, "../../../.."), process.env.NODE_ENV !== "production", {
  info: () => undefined,
  error: (...args: unknown[]) => console.error(...args),
})
