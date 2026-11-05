// The lab's databases: which one a command may use, and how it is created, migrated and given its
// Prisma client. Shared by scripts/db.ts, scripts/go-prepare.ts, scripts/bind.ts and scripts/test-db.mjs.
const { spawnSync } = require("node:child_process")
const { existsSync, readFileSync } = require("node:fs")
const { dirname, join } = require("node:path")

/** The lab's schema (@newrole/jobs-lab-db); its migrations sit next to it. */
const SCHEMA = require.resolve("@newrole/jobs-lab-db/schema.prisma")
const DB_PACKAGE = dirname(SCHEMA)
/** Where the schema's generator writes the client (output in schema.prisma). */
const CLIENT = join(DB_PACKAGE, "node_modules", ".prisma", "client")
const PRISMA = join(
  dirname(require.resolve("prisma/package.json", { paths: [DB_PACKAGE] })),
  "build",
  "index.js"
)
const FALLBACK = "postgresql://jobscanner:jobscanner@127.0.0.1:5432/jobscanner"
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])

function nameOf(url) {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""))
}

function withName(url, name) {
  const next = new URL(url)
  next.pathname = `/${name}`
  return next.toString()
}

/** host:port/name, without the user and password, for messages. */
function describe(url) {
  const parsed = new URL(url)
  return `${parsed.hostname}:${parsed.port || "5432"}/${nameOf(url)}`
}

/** Two URLs with the same key name one database, whatever user, password or options they carry. */
function databaseKey(url) {
  const parsed = new URL(url)
  const host = parsed.hostname.toLowerCase()
  return `${LOCAL_HOSTS.has(host) ? "localhost" : host}:${parsed.port || "5432"}/${nameOf(url)}`
}

/** JOBS_LAB_DATABASE_URL, or DATABASE_URL's database with "_lab" added. Null without either. */
function labDatabaseUrl(env = process.env) {
  if (env.JOBS_LAB_DATABASE_URL?.trim()) return env.JOBS_LAB_DATABASE_URL.trim()
  if (!env.DATABASE_URL?.trim()) return null
  const name = nameOf(env.DATABASE_URL) || "jobscanner"
  return withName(env.DATABASE_URL, name.endsWith("_lab") ? name : `${name}_lab`)
}

/**
 * The lab's flow tests: JOBS_LAB_TEST_DATABASE_URL, or DATABASE_URL's database with "_lab_test"
 * added. Never newrole.it's test database (DATABASE_URL's with "_test"): the schemas differ.
 */
function labTestDatabaseUrl(env = process.env) {
  if (env.JOBS_LAB_TEST_DATABASE_URL?.trim()) return env.JOBS_LAB_TEST_DATABASE_URL.trim()
  const base = env.DATABASE_URL?.trim() || FALLBACK
  const name = (nameOf(base) || "jobscanner").replace(/(_lab)?(_test)?$/, "")
  return withName(base, `${name}_lab_test`)
}

/** newrole.it's databases, which the lab never migrates: its own and its test database. */
function newroleDatabases(env = process.env) {
  const found = []
  const own = env.DATABASE_URL?.trim()
  if (own) {
    found.push({ url: own, label: "newrole.it's own database (DATABASE_URL)" })
    const name = nameOf(own)
    if (!name.endsWith("_test"))
      found.push({ url: withName(own, `${name}_test`), label: "newrole.it's test database" })
  }
  if (env.TEST_DATABASE_URL?.trim())
    found.push({
      url: env.TEST_DATABASE_URL.trim(),
      label: "newrole.it's test database (TEST_DATABASE_URL)",
    })
  return found
}

/** Why the lab may not use this database, in one line, or null when it may. */
function refusal(url, env = process.env) {
  let key
  try {
    key = databaseKey(url)
  } catch {
    return "the lab's database URL does not parse (JOBS_LAB_DATABASE_URL or DATABASE_URL)"
  }
  const name = nameOf(url)
  if (!/^[A-Za-z0-9_]+$/.test(name))
    return `refusing database name "${name}": letters, digits and _ only`
  for (const other of newroleDatabases(env)) {
    let same = false
    try {
      same = databaseKey(other.url) === key
    } catch {
      // an unreadable DATABASE_URL names no database to protect
    }
    if (same)
      return `refusing ${describe(url)}: it is ${
        other.label
      }. Give the lab a database of its own (apps/jobs-lab/.env.example)`
  }
  return null
}

/** The line of Prisma's output that says what went wrong, for a one-line reason. */
function reasonOf(output) {
  const lines = String(output || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const bare = (line) => line.replace(/^Error:\s*/, "").replace(/^ERROR:\s*/, "")
  const database = lines.find((line) => /^(Error:\s*)?ERROR:/.test(line))
  if (database) return bare(database)
  const at = lines.findIndex((line) => /^Error:/.test(line))
  if (at >= 0) {
    const first = bare(lines[at])
    return /^P\d{4}:?$/.test(first) && lines[at + 1] ? `${first} ${lines[at + 1]}` : first
  }
  return lines[lines.length - 1] || "prisma failed without a message"
}

/** Runs the Prisma CLI on the lab's schema with DATABASE_URL set to `url`. */
function prisma(args, { url, quiet = true, input } = {}) {
  const result = spawnSync(process.execPath, [PRISMA, ...args, "--schema", SCHEMA], {
    cwd: DB_PACKAGE,
    env: {
      ...process.env,
      ...(url ? { DATABASE_URL: url } : {}),
      PRISMA_HIDE_UPDATE_MESSAGE: "1",
    },
    input,
    encoding: "utf8",
    stdio: quiet ? "pipe" : ["pipe", "inherit", "inherit"],
  })
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`
  if (result.error) return { ok: false, output, reason: result.error.message }
  return { ok: result.status === 0, output, reason: result.status === 0 ? null : reasonOf(output) }
}

/** CREATE DATABASE unless it exists. Postgres has no IF NOT EXISTS for it. */
function createDatabase(url) {
  const created = prisma(["db", "execute", "--stdin"], {
    url: withName(url, "postgres"),
    input: `CREATE DATABASE "${nameOf(url)}";`,
  })
  if (created.ok || /already exists/i.test(created.output)) return { ok: true, created: created.ok }
  return { ok: false, reason: created.reason }
}

/**
 * Tables of newrole.it that hold a person's records. The lab never writes them, and its migration
 * 20261105120000_lab_tables_only drops them, so rows in one mean this is newrole.it's data.
 */
const PERSONAL_TABLES = [
  "Session",
  "Token",
  "LoginLink",
  "AuthRateLimit",
  "ProfileAuditRun",
  "LlmCache",
  "AuditEvent",
  "Application",
  "ApplicationEvent",
  "CvDocument",
  "UserOffer",
  "CvVersion",
  "Answer",
  "ApiToken",
  "SheetLink",
  "SheetRow",
  "GmailLink",
  "MailEvent",
]

/**
 * The migration checks this too, but a migration that fails stays recorded as failed and blocks
 * the next `migrate deploy`, newrole.it's own included. Checked here first, nothing is recorded.
 */
function personalRows(url) {
  const list = PERSONAL_TABLES.map((name) => `'${name}'`).join(", ")
  const checked = prisma(["db", "execute", "--stdin"], {
    url,
    input: `DO $$
DECLARE
  tbl text;
  found boolean;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[${list}] LOOP
    IF to_regclass(format('%I', tbl)) IS NOT NULL THEN
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM %I)', tbl) INTO found;
      IF found THEN
        RAISE EXCEPTION 'table "%" holds rows, so this is newrole.it''s data, not a lab database; nothing was changed', tbl;
      END IF;
    END IF;
  END LOOP;
END $$;`,
  })
  return checked.ok ? null : checked.reason
}

/** prisma migrate deploy: the lab's migrations not yet applied, after the check above. */
function migrateDatabase(url, { quiet = true } = {}) {
  const refused = personalRows(url)
  if (refused) {
    if (!quiet) console.error(`jobs lab: ${refused}`)
    return { ok: false, output: refused, reason: refused }
  }
  return prisma(["migrate", "deploy"], { url, quiet })
}

/** The generated client matches the schema: prisma generate keeps a copy of the schema it read. */
function clientIsCurrent() {
  try {
    return (
      existsSync(join(CLIENT, "index.js")) &&
      readFileSync(join(CLIENT, "schema.prisma"), "utf8") === readFileSync(SCHEMA, "utf8")
    )
  } catch {
    return false
  }
}

/** prisma generate, skipped when the client is current unless forced. */
function generateClient({ force = false } = {}) {
  if (!force && clientIsCurrent()) return { ok: true, generated: false }
  const generated = prisma(["generate"])
  return generated.ok ? { ok: true, generated: true } : { ok: false, reason: generated.reason }
}

module.exports = {
  SCHEMA,
  createDatabase,
  databaseKey,
  describe,
  generateClient,
  labDatabaseUrl,
  labTestDatabaseUrl,
  migrateDatabase,
  nameOf,
  refusal,
}
