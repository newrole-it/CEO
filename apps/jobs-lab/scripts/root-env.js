// The .env files of the repository root, for this app's next.config.js: npm run go writes .env there.
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

/**
 * Next reads the .env files of the folder it runs in and has done so before next.config.js runs.
 * This adds the root's, in the order Next uses (.env.<mode>.local, .env.local, .env.<mode>, .env),
 * never over a variable that is already set, so the shell still wins. They also join Next's
 * initial environment, so a reload of the app folder's own files keeps them.
 */
function loadRootEnv(dev = process.env.NODE_ENV !== "production") {
  if (REPO_ROOT === APP_DIR) return {}
  const mode = process.env.NODE_ENV === "test" ? "test" : dev ? "development" : "production"
  const names = [`.env.${mode}.local`, mode !== "test" && ".env.local", `.env.${mode}`, ".env"]
  const files = []
  for (const path of names.filter(Boolean)) {
    try {
      files.push({ path, contents: readFileSync(join(REPO_ROOT, path), "utf8"), env: {} })
    } catch {
      // that file is optional
    }
  }
  if (!files.length) return {}
  const log = { info: () => undefined, error: (...args) => console.error(...args) }
  const [, parsed = {}] = processEnv(files, REPO_ROOT, log, true)
  updateInitialEnv(parsed)
  return parsed
}

module.exports = { APP_DIR, REPO_ROOT, findRepoRoot, loadRootEnv }
