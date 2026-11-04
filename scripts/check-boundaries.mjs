/**
 * npm run check:boundaries: every workspace under packages/ and apps/ stands on its own.
 *
 * - A file imports only Node's built-ins, files inside its own workspace, and packages its
 *   package.json declares (dependencies, peerDependencies, devDependencies for tests and config).
 * - Nothing reaches into the newrole.it app (src/, db, config/, mcp/, matching/) or another
 *   workspace's files by path.
 * - The @newrole/* packages depend on each other without cycles, and none depends on an app.
 *
 * TypeScript checks that the imports resolve; this checks that they are allowed.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
const SKIP_DIRS = new Set(["node_modules", ".next", ".data", "dist", "coverage"])
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/
// Statements only: "import" or "export" at the start of a line (after spaces), not inside a string.
const SPECIFIER =
  /^\s*(?:import|export)\s[^'"`;]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|(?<![\w$.-])import\(\s*["']([^"']+)["']\s*\)|(?<![\w$.-])require\(\s*["']([^"']+)["']\s*\)|reference path=["']([^"']+)["']/gm

function workspaces() {
  const found = []
  for (const group of ["packages", "apps"]) {
    const dir = join(ROOT, group)
    let names = []
    try {
      names = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      const path = join(dir, name)
      try {
        const manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"))
        found.push({ group, path, manifest })
      } catch {
        // not a workspace
      }
    }
  }
  return found
}

function files(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...files(path))
    else if (SOURCE.test(name) && !name.endsWith(".d.ts")) out.push(path)
  }
  return out
}

/** "@scope/name/sub" → "@scope/name"; "name/sub" → "name". */
function packageName(specifier) {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const all = workspaces()
const byName = new Map(all.map((ws) => [ws.manifest.name, ws]))
const problems = []

for (const ws of all) {
  const { manifest, path } = ws
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
  // an app's own alias for its src/ (apps/cv/tsconfig.json)
  const aliases = ws.group === "apps" ? ["@/"] : []
  for (const file of files(path)) {
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match.slice(1).find(Boolean)
      const where = relative(ROOT, file)
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier)
        if (!target.startsWith(path + sep))
          problems.push(`${where}: "${specifier}" leaves ${relative(ROOT, path)}`)
        continue
      }
      if (aliases.some((alias) => specifier.startsWith(alias))) continue
      if (BUILTINS.has(specifier) || BUILTINS.has(packageName(specifier))) continue
      const name = packageName(specifier)
      if (!declared.has(name)) {
        problems.push(`${where}: "${specifier}" is not a dependency of ${manifest.name}`)
        continue
      }
      const target = byName.get(name)
      if (target && target.group === "apps")
        problems.push(`${where}: ${manifest.name} imports the app ${name}`)
    }
  }
}

// no cycles between the packages
const graph = new Map(
  all
    .filter((ws) => ws.group === "packages")
    .map((ws) => [
      ws.manifest.name,
      Object.keys({ ...ws.manifest.dependencies, ...ws.manifest.peerDependencies }).filter((dep) =>
        byName.has(dep)
      ),
    ])
)
const state = new Map()
function visit(name, trail) {
  if (state.get(name) === "done") return
  if (state.get(name) === "open") {
    problems.push(`dependency cycle: ${[...trail, name].join(" → ")}`)
    return
  }
  state.set(name, "open")
  for (const dep of graph.get(name) ?? []) visit(dep, [...trail, name])
  state.set(name, "done")
}
for (const name of graph.keys()) visit(name, [])

if (problems.length) {
  console.error(
    `Workspace boundaries: ${problems.length} problem(s)\n${problems
      .map((p) => `  ${p}`)
      .join("\n")}`
  )
  process.exit(1)
}
console.log(`Workspace boundaries hold: ${all.map((ws) => ws.manifest.name).join(", ")}`)
