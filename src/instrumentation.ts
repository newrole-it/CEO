/**
 * Runs once when the Next server boots. blitz-server.ts checks the secrets too, but only when the
 * first request loads it; here a public server with sample secrets stops before it serves anyone.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  const { assertSafeProductionEnv } = await import("src/server/security/env-check")
  try {
    assertSafeProductionEnv()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
