import { PrismaPg } from "@prisma/adapter-pg"

/**
 * Prisma 7 connects through a driver adapter: node-postgres, at DATABASE_URL.
 * node-postgres waits forever for a connection by default; Prisma 5 gave up after 5 seconds.
 */
export function pgAdapter() {
  return new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  })
}
