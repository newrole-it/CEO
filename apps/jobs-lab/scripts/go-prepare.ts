/**
 * npm run go:prepare -w @newrole/jobs-lab: what the lab needs before `dev` and `worker` start. The
 * root's npm run go runs it when APP_JOBS_LAB is on (the "go" field in package.json), with the
 * root's .env already in the environment.
 *
 * The lab's database (never newrole.it's own) created if missing, the lab's migrations applied,
 * its Prisma client generated when the schema changed, and the seed data: the platforms and the
 * seed catalog's career pages. Safe to run again. On failure it exits non-zero with one line.
 */
import { labDatabase } from "./env"
import { createDatabase, describe, generateClient, migrateDatabase } from "./databases"

function fail(reason: string): never {
  console.error(`jobs lab: ${reason.replace(/\s+/g, " ").trim()}`)
  process.exit(1)
}

async function main() {
  const target = labDatabase()
  if ("reason" in target) fail(target.reason)
  const where = describe(target.url)

  const client = generateClient()
  if (!client.ok) fail(`could not generate the Prisma client: ${client.reason}`)

  const created = createDatabase(target.url)
  if (!created.ok) fail(`could not create ${where}: ${created.reason}`)

  const migrated = migrateDatabase(target.url)
  if (!migrated.ok) fail(`could not migrate ${where}: ${migrated.reason}`)

  // Loaded only now: the client they import may have been generated a moment ago.
  const { bindLabDatabase } = await import("./bind")
  const { seedIndex } = await import("@newrole/job-index/seed")
  const db = bindLabDatabase()
  try {
    const { careerPages } = await seedIndex(db)
    console.log(`jobs lab: ${where} ready, ${careerPages} seed career pages`)
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) =>
  fail(`could not load the seed data: ${error instanceof Error ? error.message : error}`)
)
