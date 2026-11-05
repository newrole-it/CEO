import { PrismaClient } from "@newrole/jobs-lab-db"
import { configureJobIndex } from "@newrole/job-index/host"
import { labDatabase } from "./env"

/**
 * A Prisma client on the lab's database, bound to the engine. Exits when there is none, or when it
 * would be newrole.it's own (scripts/databases.js).
 */
export function bindLabDatabase(): PrismaClient {
  const target = labDatabase()
  if ("reason" in target) {
    console.error(`jobs lab: ${target.reason}`)
    process.exit(2)
  }
  const db = new PrismaClient({ datasources: { db: { url: target.url } } })
  configureJobIndex({ db })
  return db
}
