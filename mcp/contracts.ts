/**
 * Modules owned by the matching and discovery streams (plan section 7). Loaded lazily so the
 * server still starts, and says which file is missing, while one of them is not merged yet.
 */

export class PendingError extends Error {
  constructor(public file: string) {
    super(`This tool needs ${file}, which is not in this checkout yet.`)
  }
}

function missing(error: unknown, segment: string): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: string }).code
  const message = String((error as { message?: string }).message ?? "")
  return (
    (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") && message.includes(segment)
  )
}

async function load<T>(file: string, loader: () => Promise<T>): Promise<T> {
  try {
    return await loader()
  } catch (error) {
    if (missing(error, file.replace(/\.ts$/, ""))) throw new PendingError(file)
    throw error
  }
}

export const feedbackModule = () =>
  load("src/server/preferences/feedback.ts", () => import("src/server/preferences/feedback"))
export const promptModule = () =>
  load("src/server/preferences/prompt.ts", () => import("src/server/preferences/prompt"))
export const similarModule = () =>
  load("src/server/preferences/similar.ts", () => import("src/server/preferences/similar"))
export const watchModule = () =>
  load("src/server/watchlist/watch.ts", () => import("src/server/watchlist/watch"))
export const ingestModule = () =>
  load("src/server/discovery/ingest-offer.ts", () => import("src/server/discovery/ingest-offer"))
export const similarCompaniesModule = () =>
  load(
    "src/server/discovery/similar-companies.ts",
    () => import("src/server/discovery/similar-companies")
  )
