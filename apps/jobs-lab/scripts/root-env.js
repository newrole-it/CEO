// The .env files the lab reads: its own folder's, then the repository root's when it sits in one
// (npm run go writes .env there). For next.config.js and for the lab's scripts.
const { readFileSync } = require("node:fs")
const { dirname, join, resolve } = require("node:path")
const { processEnv, updateInitialEnv } = require("@next/env")

const APP_DIR = resolve(__dirname, "..")

/**
 * The folder whose package.json lists the workspaces this app belongs to; the app's own folder when
 * it runs on its own.
 */
function findRepoRoot(from = APP_DIR) {
  let dir = from
  for (;;) {
    try {
      if (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).workspaces) return dir
    } catch {
      // no package.json here, keep looking
    }
    const parent = dirname(dir)
    if (parent === dir) return from
    dir = parent
  }
}

const REPO_ROOT = findRepoRoot()

const log = { info: () => undefined, error: (...args) => console.error(...args) }

/** A folder's .env files in the order Next reads them: .env.<mode>.local, .env.local, .env.<mode>, .env. */
function envFiles(dir, dev) {
  const mode = process.env.NODE_ENV === "test" ? "test" : dev ? "development" : "production"
  const names = [`.env.${mode}.local`, mode !== "test" && ".env.local", `.env.${mode}`, ".env"]
  const files = []
  for (const name of names.filter(Boolean)) {
    try {
      files.push({
        path: join(dir, name),
        contents: readFileSync(join(dir, name), "utf8"),
        env: {},
      })
    } catch {
      // that file is optional
    }
  }
  return files
}

/**
 * Sets what the files hold (the first file that names a variable wins) and puts back any variable
 * that was set before: @next/env compares with the environment it first saw, not the current one.
 */
function addEnv(files) {
  if (!files.length) return {}
  const before = { ...process.env }
  const [, parsed = {}] = processEnv(files, "", log, true)
  for (const key of Object.keys(parsed)) {
    if (before[key] === undefined) continue
    process.env[key] = before[key]
    delete parsed[key]
  }
  return parsed
}

/**
 * Next reads the .env files of the folder it runs in and has done so before next.config.js runs.
 * This adds the root's, never over a variable that is already set, so the shell and the app's own
 * files still win. They also join Next's initial environment, so a reload of the app folder's own
 * files keeps them.
 */
function loadRootEnv(dev = process.env.NODE_ENV !== "production") {
  if (REPO_ROOT === APP_DIR) return {}
  const parsed = addEnv(envFiles(REPO_ROOT, dev))
  updateInitialEnv(parsed)
  return parsed
}

/**
 * For the lab's scripts, which Next does not start: the app's own .env files first, then the
 * root's, as next.config.js ends up with them. Nothing overrides the shell.
 */
function loadAppEnv(dev = process.env.NODE_ENV !== "production") {
  const root = REPO_ROOT === APP_DIR ? [] : envFiles(REPO_ROOT, dev)
  return addEnv([...envFiles(APP_DIR, dev), ...root])
}

module.exports = { APP_DIR, REPO_ROOT, findRepoRoot, loadAppEnv, loadRootEnv }
