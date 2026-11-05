/**
 * npm run db:prepare -w @newrole/jobs-lab: the lab's own database, created if missing, with the
 * lab's migrations applied (@newrole/jobs-lab-db). The engine's index goes there, never into
 * newrole.it's data: it refuses DATABASE_URL's database and newrole.it's test database.
 */
import { labDatabase } from "./env"
import { createDatabase, describe, migrateDatabase } from "./databases"

const target = labDatabase()
if ("reason" in target) {
  console.error(`jobs lab: ${target.reason}`)
  process.exit(2)
}
const created = createDatabase(target.url)
if (!created.ok) {
  console.error(`jobs lab: could not create ${describe(target.url)}: ${created.reason}`)
  process.exit(1)
}
const migrated = migrateDatabase(target.url, { quiet: false })
if (!migrated.ok) process.exit(1)
console.log(`Lab database ready: ${describe(target.url)}`)
