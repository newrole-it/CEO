/**
 * The test database, next to the one in .env. `npm run go` writes a random database password and
 * may pick another port, so the flow tests cannot hardcode jobscanner:jobscanner@127.0.0.1:5432.
 *
 *   node scripts/test-db.mjs url              print the test database URL
 *   node scripts/test-db.mjs prepare          create it if missing and apply the migrations
 *   node scripts/test-db.mjs run <command…>   run a command with DATABASE_URL pointing at it
 *
 * TEST_DATABASE_URL wins when set. Otherwise the database name in DATABASE_URL gets "_test".
 */
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import rootEnv from "./root-env.js"

const APP = join(dirname(fileURLToPath(import.meta.url)), "..")
// This app's schema and migrations.
const SCHEMA = join(APP, "db", "schema.prisma")
const FALLBACK = "postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner"
// Only for tests: Blitz needs a 32-character secret, and these sessions never leave the test DB.
const TEST_SESSION_SECRET = "jobscanner-dev-session-secret-key-32b"

/** The app's own .env first, then the repository root's, where npm run go writes it. */
function fromDotEnv(name) {
  for (const dir of [...new Set([APP, rootEnv.REPO_ROOT])]) {
    const file = join(dir, ".env")
    if (!existsSync(file)) continue
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.*)\\s*$`))
      if (match) return match[1].replace(/^(["'])(.*)\1$/, "$2")
    }
  }
  return undefined
}

export function testDatabaseUrl(env = process.env) {
  const explicit = env.TEST_DATABASE_URL || fromDotEnv("TEST_DATABASE_URL")
  if (explicit) return explicit
  const url = new URL(env.DATABASE_URL || fromDotEnv("DATABASE_URL") || FALLBACK)
  const name = url.pathname.replace(/^\//, "") || "jobscanner"
  url.pathname = `/${name.endsWith("_test") ? name : `${name}_test`}`
  return url.toString()
}

/** In the folder it was called from: `npm run test:flow -w @newrole/app` runs in apps/resume-engine-optimization. */
function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: "inherit", env, shell: false })
  return result.status ?? 1
}

function prepare(url) {
  const admin = new URL(url)
  const name = admin.pathname.replace(/^\//, "")
  if (!/^[A-Za-z0-9_]+_test$/.test(name)) {
    console.error(`Refusing to prepare ${name}: a test database name ends in _test.`)
    return 1
  }
  admin.pathname = "/postgres"
  // CREATE DATABASE has no IF NOT EXISTS in Postgres; an "already exists" error is fine here.
  const created = spawnSync(
    "npx",
    ["prisma", "db", "execute", "--url", admin.toString(), "--stdin"],
    { cwd: APP, input: `CREATE DATABASE "${name}";`, encoding: "utf8" }
  )
  if (created.status !== 0 && !/already exists/i.test(`${created.stdout}${created.stderr}`)) {
    process.stderr.write(created.stderr || created.stdout)
    return created.status ?? 1
  }
  return run("npx", ["prisma", "migrate", "deploy", "--schema", SCHEMA], {
    ...process.env,
    DATABASE_URL: url,
  })
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const [mode, ...rest] = process.argv.slice(2)
  const url = testDatabaseUrl()
  if (mode === "url") {
    console.log(url)
  } else if (mode === "prepare") {
    process.exit(prepare(url))
  } else if (mode === "run" && rest.length) {
    const env = {
      ...process.env,
      DATABASE_URL: url,
      SESSION_SECRET_KEY: process.env.TEST_SESSION_SECRET_KEY || TEST_SESSION_SECRET,
    }
    process.exit(run(rest[0], rest.slice(1), env))
  } else {
    console.error("Usage: node scripts/test-db.mjs url | prepare | run <command…>")
    process.exit(2)
  }
}
