// The names of the packages under packages/, for the next.config.js of every app in apps/.
const { readdirSync, readFileSync, existsSync } = require("node:fs")
const { join } = require("node:path")

const PACKAGES = join(__dirname, "..", "packages")

function workspacePackages() {
  if (!existsSync(PACKAGES)) return []
  return readdirSync(PACKAGES)
    .map((dir) => join(PACKAGES, dir, "package.json"))
    .filter((file) => existsSync(file))
    .map((file) => JSON.parse(readFileSync(file, "utf8")).name)
}

module.exports = { workspacePackages }
