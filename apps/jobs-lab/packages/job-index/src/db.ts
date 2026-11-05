import type { PrismaClient } from "@newrole/jobs-lab-db"
import { jobIndexHost } from "./host"

/**
 * The Prisma client the app bound with configureJobIndex, looked up on every use, so a module
 * of the engine can be imported before the app has bound it.
 */
const db = new Proxy({} as PrismaClient, {
  get(_target, key) {
    const client = jobIndexHost().db as unknown as Record<string | symbol, unknown>
    const value = client[key]
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown).bind(client)
      : value
  },
})

export default db
