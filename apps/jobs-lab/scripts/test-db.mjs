/**
 * The lab's test database, apart from newrole.it's (`<db>_test`) because the two schemas differ.
 * `npm run go` writes a random database password and may pick another port, so the flow tests
 * cannot hardcode jobscanner:jobscanner@127.0.0.1:5432.
 *
 *   node scripts/test-db.mjs url              print the test database URL
 *   node scripts/test-db.mjs prepare          create it if missing and apply the lab's migrations
 *   node scripts/test-db.mjs run <command…>   prepare it, then run a command with DATABASE_URL on it
 *
 * JOBS_LAB_TEST_DATABASE_URL wins when set. Otherwise the database name in DATABASE_URL gets
 * "_lab_test". The shell first, then the lab's .env files, then the repository root's.
 */
import { spawnSync } from "node:child_process"
import databases from "./databases.js"
import rootEnv from "./root-env.js"

rootEnv.loadAppEnv()

function prepare(url) {
  const name = databases.nameOf(url)
  if (!name.endsWith("_test")) {
    console.error(`Refusing to prepare ${name}: a test database name ends in _test.`)
    return 1
  }
  const refused = databases.refusal(url)
  if (refused) {
    console.error(`jobs lab: ${refused}`)
    return 1
  }
  const created = databases.createDatabase(url)
  if (!created.ok) {
    console.error(`jobs lab: could not create ${databases.describe(url)}: ${created.reason}`)
    return 1
  }
  const migrated = databases.migrateDatabase(url)
  if (!migrated.ok) {
    console.error(`jobs lab: could not migrate ${databases.describe(url)}: ${migrated.reason}`)
    return 1
  }
  return 0
}

/** In the folder it was called from: `npm run test:flow -w @newrole/job-index` runs in apps/jobs-lab/packages/job-index. */
function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: false })
  return result.status ?? 1
}

const [mode, ...rest] = process.argv.slice(2)
const url = databases.labTestDatabaseUrl()
if (mode === "url") {
  console.log(url)
} else if (mode === "prepare") {
  process.exit(prepare(url))
} else if (mode === "run" && rest.length) {
  const prepared = prepare(url)
  if (prepared !== 0) process.exit(prepared)
  process.exit(run(rest[0], rest.slice(1), { ...process.env, DATABASE_URL: url }))
} else {
  console.error("Usage: node scripts/test-db.mjs url | prepare | run <command…>")
  process.exit(2)
}
