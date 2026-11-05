import { PrismaClient } from "@prisma/client"
import { configureJobIndex } from "@newrole/job-index/host"
import { labDatabaseUrl } from "./env"

/** A Prisma client on the lab's database, bound to the engine. Exits when there is none. */
export function bindLabDatabase(): PrismaClient {
  const url = labDatabaseUrl()
  if (!url) {
    console.error(
      "No database: set DATABASE_URL in .env (npm run go writes it) or JOBS_LAB_DATABASE_URL."
    )
    process.exit(2)
  }
  const db = new PrismaClient({ datasources: { db: { url } } })
  configureJobIndex({ db })
  return db
}
