// The @newrole/* packages this app is made of, for next.config.js: they ship TypeScript source.
const { existsSync, readFileSync } = require("node:fs")
const { dirname, join, resolve } = require("node:path")

const APP_DIR = resolve(__dirname, "..")

/** A package's package.json, looked up the way Node does: node_modules here, then each folder up. */
function manifestOf(name, from) {
  let dir = from
  for (;;) {
    const file = join(dir, "node_modules", name, "package.json")
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"))
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Every @newrole/* package the app declares, and the ones those declare, without repeats. */
function workspacePackages(appDir = APP_DIR) {
  const own = JSON.parse(readFileSync(join(appDir, "package.json"), "utf8"))
  const found = new Set()
  const queue = [own]
  while (queue.length) {
    const manifest = queue.shift()
    const names = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })
    for (const name of names) {
      if (!name.startsWith("@newrole/") || found.has(name)) continue
      found.add(name)
      const next = manifestOf(name, appDir)
      if (next) queue.push(next)
    }
  }
  return [...found].sort()
}

module.exports = { workspacePackages }
