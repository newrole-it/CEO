/**
 * Set by `npm run harvest`. A cloud run has no database, so the per-host pace is kept in memory:
 * one process reads every board, which is what the shared Postgres slot exists to coordinate.
 */
export function harvestMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.NEWROLE_HARVEST === "1"
}
