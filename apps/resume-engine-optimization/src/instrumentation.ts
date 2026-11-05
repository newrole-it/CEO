/**
 * Runs once when the Next server boots. blitz-server.ts checks the secrets too, but only when the
 * first request loads it; here a public server with sample secrets stops before it serves anyone.
 * Then the server starts newrole.it's background work, so the app needs no second process.
 */
export async function register() {
  // Inside the condition, as the Next docs on instrumentation ask: the code is Node-only.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertSafeProductionEnv } = await import("src/server/security/env-check")
    try {
      assertSafeProductionEnv()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
      process.exit(1)
    }
    const { startInServer } = await import("src/server/queue/worker")
    startInServer()
  }
}
