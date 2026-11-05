/**
 * npm run db:prepare -w @newrole/jobs-lab: the lab's own database, created if missing, with
 * newrole.it's migrations applied. The engine's index goes there, never into newrole.it's data.
 */
import { spawnSync } from "node:child_process"
import { labDatabaseUrl, SCHEMA } from "./env"

const url = labDatabaseUrl()
if (!url) {
  console.error("No database: set DATABASE_URL in .env or JOBS_LAB_DATABASE_URL.")
  process.exit(2)
}
const target = new URL(url)
const name = target.pathname.replace(/^\//, "")
if (!/^[A-Za-z0-9_]+$/.test(name)) {
  console.error(`Refusing a database name with other characters: ${name}`)
  process.exit(2)
}
const admin = new URL(url)
admin.pathname = "/postgres"
const created = spawnSync(
  "npx",
  ["prisma", "db", "execute", "--url", admin.toString(), "--stdin"],
  {
    input: `CREATE DATABASE "${name}";`,
    encoding: "utf8",
  }
)
if (created.status !== 0 && !/already exists/i.test(`${created.stdout}${created.stderr}`)) {
  process.stderr.write(created.stderr || created.stdout)
  process.exit(created.status ?? 1)
}
const migrated = spawnSync("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
})
if (migrated.status === 0) console.log(`Lab database ready: ${target.host}/${name}`)
process.exit(migrated.status ?? 1)
