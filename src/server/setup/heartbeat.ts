import db from "db"

export type HeartbeatService = "worker" | "mcp"

const EVERY_MS = 30_000
const lastBeat = new Map<HeartbeatService, number>()

/**
 * A sign of life for /setup, which cannot see these processes directly. At most one write
 * per 30 s per process, and it never fails the caller: a missing heartbeat only shows on /setup.
 */
export async function beat(service: HeartbeatService, now = Date.now()): Promise<void> {
  if (now - (lastBeat.get(service) ?? 0) < EVERY_MS) return
  lastBeat.set(service, now)
  try {
    const lastSeenAt = new Date(now)
    await db.serviceHeartbeat.upsert({
      where: { service },
      update: { lastSeenAt },
      create: { service, lastSeenAt },
    })
  } catch (error) {
    console.error(`Heartbeat ${service} failed`, error instanceof Error ? error.message : error)
  }
}
