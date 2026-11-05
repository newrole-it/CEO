#!/usr/bin/env node
/**
 * From a fresh clone to a running app, in one command: npm run go
 * Safe to run every day: each step skips what is already done. Built-in Node modules only,
 * because this runs before anything is installed. `--prepare` stops before starting the app
 * (npm run setup), `--no-open` leaves the browser alone, and `--extension` only installs and
 * rebuilds the Chrome extension (npm run ext:build).
 */
import { spawn, spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { connect, createServer } from "node:net"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
/** newrole.it itself; the root holds .env and the workspaces. */
const APP = join(ROOT, "apps", "resume-engine-optimization")
const SCHEMA = join(APP, "db", "schema.prisma")
/** The Chrome extension: an app of its own with its own lockfile, not a workspace. */
const EXTENSION = join(ROOT, "apps", "reo-extension")
const ENV_FILE = join(ROOT, ".env")
const BIN = (name) => join(ROOT, "node_modules", ".bin", name)
const MIN_NODE = 22
const DEFAULT_PORT = 5432

const prepareOnly = process.argv.includes("--prepare")
const noOpen = process.argv.includes("--no-open")

const ok = (text) => console.log(`  ✓ ${text}`)
const info = (text) => console.log(`  • ${text}`)
function fail(title, ...help) {
  console.error(`\n  ✗ ${title}`)
  for (const line of help) console.error(`    ${line}`)
  console.error("")
  process.exit(1)
}

/** Runs a command quietly and shows its output only if it fails. */
function run(command, args, { cwd = ROOT, env = process.env, title } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: "utf8", shell: false })
  if (result.status === 0) return result
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  if (result.error?.code === "ENOENT") fail(`${title}: "${command}" was not found.`)
  // Could not start at all (permissions, a broken node_modules/.bin link): the error is the clue.
  if (result.error) fail(`${title} failed.`, result.error.message)
  if (result.signal)
    fail(`${title} was stopped by ${result.signal}.`, ...output.split("\n").slice(-25))
  fail(`${title} failed.`, ...output.split("\n").slice(-25))
}

const npm = "npm"

function checkNode() {
  if (process.platform === "win32") {
    fail(
      "On Windows, run newrole.it inside WSL.",
      "https://learn.microsoft.com/windows/wsl/install"
    )
  }
  const major = Number(process.versions.node.split(".")[0])
  if (major < MIN_NODE) {
    fail(
      `newrole.it needs Node ${MIN_NODE} or newer. You have ${process.versions.node}.`,
      `With nvm: nvm install ${MIN_NODE} && nvm use ${MIN_NODE}`,
      "Or download it from https://nodejs.org"
    )
  }
  ok(`Node ${process.versions.node}`)
}

// ------------------------------------------------------------------- .env

function parseEnv(text) {
  const out = {}
  for (const line of text.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match) continue
    out[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2")
  }
  return out
}

function setLine(text, key, value) {
  const line = `${key}="${value}"`
  const pattern = new RegExp(`^${key}=.*$`, "m")
  return pattern.test(text) ? text.replace(pattern, line) : `${text.trimEnd()}\n${line}\n`
}

function portFree(port) {
  return new Promise((done) => {
    const server = createServer()
    server.once("error", () => done(false))
    server.once("listening", () => server.close(() => done(true)))
    server.listen(port, "127.0.0.1")
  })
}

/** Another Postgres on 5432 is common, so a new install takes the next free port instead. */
async function freePostgresPort() {
  if (await portFree(DEFAULT_PORT)) return DEFAULT_PORT
  for (let port = 55432; port < 55532; port += 1) {
    if (await portFree(port)) return port
  }
  fail("No free port for the database.", "Set DATABASE_URL in .env to a Postgres you already run.")
}

async function ensureEnv() {
  if (existsSync(ENV_FILE)) {
    ok(".env exists")
    return
  }
  const password = randomBytes(18).toString("hex")
  const port = await freePostgresPort()
  let text = readFileSync(join(ROOT, ".env.example"), "utf8")
  text = setLine(text, "SESSION_SECRET_KEY", randomBytes(32).toString("hex"))
  text = setLine(text, "POSTGRES_PASSWORD", password)
  text = setLine(
    text,
    "DATABASE_URL",
    `postgresql://jobscanner:${password}@127.0.0.1:${port}/jobscanner`
  )
  if (port !== DEFAULT_PORT) text = setLine(text, "POSTGRES_PORT", String(port))
  // The old project name stays in this default: a new one would add a second owner to existing installs.
  text = setLine(text, "OWNER_EMAIL", "owner@nowarola.local")
  text = setLine(text, "OWNER_NAME", "Owner")
  text = setLine(text, "OWNER_PASSWORD", randomBytes(18).toString("hex"))
  writeFileSync(ENV_FILE, text, { mode: 0o600 })
  ok(`.env created with fresh secrets${port === DEFAULT_PORT ? "" : ` (database on port ${port})`}`)
}

// ------------------------------------------------------------ dependencies

function newestMtime(path) {
  if (!existsSync(path)) return 0
  const stat = statSync(path)
  if (!stat.isDirectory()) return stat.mtimeMs
  return readdirSync(path).reduce((latest, name) => {
    if (name === "node_modules" || name === ".output" || name === ".wxt") return latest
    return Math.max(latest, newestMtime(join(path, name)))
  }, 0)
}

/** Missing, or the lockfile changed after the last install (a git pull with new packages). */
function needsInstall(dir, probe) {
  if (!existsSync(join(dir, probe))) return true
  const marker = join(dir, "node_modules", ".package-lock.json")
  const lock = join(dir, "package-lock.json")
  return existsSync(marker) && existsSync(lock) && statSync(lock).mtimeMs > statSync(marker).mtimeMs
}

function install(dir, probe, label) {
  if (!needsInstall(dir, probe)) {
    ok(`${label}: installed`)
    return
  }
  info(`${label}: installing packages, this can take a few minutes...`)
  run(npm, ["ci", "--no-audit", "--no-fund", "--loglevel=error"], {
    cwd: dir,
    title: `Installing ${label}`,
  })
  ok(`${label}: installed`)
}

// ---------------------------------------------------------------- database

function databaseAddress(url) {
  try {
    const parsed = new URL(url)
    return { host: parsed.hostname || "127.0.0.1", port: Number(parsed.port) || DEFAULT_PORT }
  } catch {
    fail("DATABASE_URL in .env is not a valid address.", `It is: ${url}`)
  }
}

function canConnect({ host, port }, timeoutMs = 1500) {
  return new Promise((done) => {
    const socket = connect({ host, port })
    const finish = (value) => {
      socket.destroy()
      done(value)
    }
    socket.setTimeout(timeoutMs, () => finish(false))
    socket.once("connect", () => finish(true))
    socket.once("error", () => finish(false))
  })
}

async function ensureDatabase(env) {
  const address = databaseAddress(env.DATABASE_URL)
  if (await canConnect(address)) {
    ok(`Database reachable on ${address.host}:${address.port}`)
    return
  }
  const local = ["127.0.0.1", "localhost"].includes(address.host)
  const docker = spawnSync("docker", ["info"], { stdio: "ignore" })
  if (!local || docker.error || docker.status !== 0) {
    fail(
      `No database on ${address.host}:${address.port}, and ${
        docker.error ? "Docker is not installed" : "Docker is not running"
      }.`,
      "Start Docker Desktop (https://www.docker.com/products/docker-desktop) and run npm run go again.",
      "Or point DATABASE_URL in .env at a Postgres you already run."
    )
  }
  info("Starting the database in Docker...")
  run("docker", ["compose", "up", "-d", "--wait", "db"], { env, title: "Starting the database" })
  ok(`Database running in Docker on port ${address.port}`)
}

function migrate(env) {
  const result = spawnSync(BIN("prisma"), ["migrate", "deploy", "--schema", SCHEMA], {
    cwd: APP,
    env,
    encoding: "utf8",
  })
  if (result.status !== 0) {
    const output = `${result.stdout}${result.stderr}`
    if (/P1000|Authentication failed/.test(output)) {
      fail(
        "The database refused the password in .env.",
        "Something else answers on that port, or the Docker volume was created with an older .env.",
        "To start over with an empty database: docker compose down -v, then npm run go.",
        "Or set DATABASE_URL in .env to the right address and password."
      )
    }
    fail("Database migration failed.", ...output.trim().split("\n").slice(-20))
  }
  run(BIN("prisma"), ["generate", "--schema", SCHEMA], {
    cwd: APP,
    env,
    title: "Generating the database client",
  })
  run(BIN("tsx"), ["db/seed.ts"], { cwd: APP, env, title: "Loading the starting data" })
  ok("Database up to date, starting data loaded")
}

// --------------------------------------------------------------- extension

function installExtension() {
  install(EXTENSION, join("node_modules", ".bin", "wxt"), "Extension")
}

function buildExtension({ force = false } = {}) {
  const dir = EXTENSION
  const manifest = join(dir, ".output", "chrome-mv3", "manifest.json")
  const built = existsSync(manifest) ? statSync(manifest).mtimeMs : 0
  const sources = ["entrypoints", "lib", "icons", "wxt.config.ts", "package.json"]
  const changed = Math.max(...sources.map((name) => newestMtime(join(dir, name))))
  if (!force && built >= changed) {
    ok("Chrome extension built")
    return
  }
  info("Building the Chrome extension...")
  run(npm, ["run", "build"], { cwd: dir, title: "Building the Chrome extension" })
  ok("Chrome extension built")
}

function reportClaude() {
  const dirs = (process.env.PATH ?? "").split(":")
  dirs.push(join(homedir(), ".local", "bin"), join(homedir(), ".claude", "local"))
  if (dirs.some((dir) => dir && existsSync(join(dir, "claude")))) {
    ok("Claude Code found")
    return
  }
  info("Claude Code not found. The app runs without it; /setup shows how to add it.")
}

// ------------------------------------------------------------------- start

function appUrl(env) {
  try {
    return new URL(env.APP_ORIGIN || "http://127.0.0.1:43123")
  } catch {
    fail("APP_ORIGIN in .env is not a valid address.", `It is: ${env.APP_ORIGIN}`)
  }
}

async function isOurApp(origin) {
  try {
    const response = await fetch(`${origin}/api/setup/status`, {
      signal: AbortSignal.timeout(4000),
    })
    const data = await response.json()
    // "nowarola" is what an app started before the rename to newrole.it answers.
    return data?.app === "newrole" || data?.app === "nowarola"
  } catch {
    return false
  }
}

function openBrowser(url) {
  if (noOpen) return
  const command = process.platform === "darwin" ? "open" : "xdg-open"
  spawn(command, [url], { stdio: "ignore", detached: true })
    .on("error", () => undefined)
    .unref()
}

async function start(env) {
  const url = appUrl(env)
  const origin = url.origin
  const port = url.port || "43123"
  if (await isOurApp(origin)) {
    ok(`Already running: ${origin}/setup`)
    openBrowser(`${origin}/setup`)
    return
  }
  if (!(await portFree(Number(port)))) {
    fail(
      `Port ${port} is taken by another program.`,
      `Stop it, or set APP_ORIGIN="http://127.0.0.1:<another port>" in .env.`
    )
  }
  console.log(`\n  Starting the app and the worker. Open ${origin}/setup when it is ready.`)
  console.log("  Press Ctrl+C to stop both.\n")
  const child = spawn(
    BIN("concurrently"),
    [
      "-k",
      "-n",
      "web,worker",
      "-c",
      "cyan,magenta",
      // Same as `npm run dev`: webpack, because Turbopack breaks Blitz RPC resolvers on Next 16.
      `${JSON.stringify(BIN("next"))} dev --webpack -p ${port} -H 127.0.0.1`,
      `${JSON.stringify(BIN("tsx"))} src/worker.ts`,
    ],
    { cwd: APP, env, stdio: "inherit" }
  )
  child.on("exit", (code) => process.exit(code ?? 0))
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal))
  // The first page compiles on demand, so wait for it before opening the browser.
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await new Promise((done) => setTimeout(done, 2000))
    if (await isOurApp(origin)) {
      console.log(`\n  Ready: ${origin}/setup\n`)
      openBrowser(`${origin}/setup`)
      return
    }
  }
  console.log(`\n  Still starting. Open ${origin}/setup in a moment.\n`)
}

async function main() {
  console.log("\n  newrole.it\n")
  checkNode()
  if (process.argv.includes("--extension")) {
    installExtension()
    buildExtension({ force: true })
    console.log(`\n  Load this folder at chrome://extensions:`)
    console.log(`  ${join(EXTENSION, ".output", "chrome-mv3")}\n`)
    return
  }
  await ensureEnv()
  // The shell wins, then .env.local, then .env: the same order Next reads them in.
  const local = join(ROOT, ".env.local")
  const env = {
    ...parseEnv(readFileSync(ENV_FILE, "utf8")),
    ...(existsSync(local) ? parseEnv(readFileSync(local, "utf8")) : {}),
    ...process.env,
  }
  install(ROOT, join("node_modules", ".bin", "next"), "App")
  installExtension()
  await ensureDatabase(env)
  migrate(env)
  buildExtension()
  reportClaude()
  if (prepareOnly) {
    console.log("\n  Ready. Start it with: npm run go\n")
    return
  }
  await start(env)
}

main().catch((error) => fail("Setup stopped.", String(error?.message ?? error)))
