import db from "db"

/**
 * The web app and the MCP server are separate processes, and /bot promises a site at least one
 * request per interval from all of them together. So the next free moment for a host
 * lives in Postgres: one atomic upsert reserves it and says how long this caller has to wait.
 *
 * The row reuses AuthRateLimit (key, windowStart) so no migration is needed: windowStart holds the
 * moment after this caller's request when the host is free again.
 */
export async function reserveHostSlot(
  host: string,
  intervalMs: number,
  now: number = Date.now()
): Promise<number> {
  const key = `host-pace:${host.toLowerCase()}`
  const rows = await db.$queryRaw<{ windowStart: Date }[]>`
    INSERT INTO "AuthRateLimit" ("key", "windowStart", "count")
    VALUES (${key}, ${new Date(now + intervalMs)}, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = GREATEST("AuthRateLimit"."windowStart", ${new Date(now)}::timestamp)
        + ${intervalMs}::int * interval '1 millisecond',
      "count" = 1
    RETURNING "windowStart"`
  const freeAgainAt = rows[0]?.windowStart.getTime() ?? now + intervalMs
  return Math.max(0, freeAgainAt - intervalMs - now)
}
