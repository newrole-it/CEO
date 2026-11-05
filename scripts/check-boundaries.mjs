/**
 * npm run check:boundaries: every workspace under packages/ and apps/ stands on its own.
 *
 * - A file imports only Node's built-ins, files inside its own workspace, and packages its
 *   package.json declares (dependencies, peerDependencies, devDependencies for tests and config).
 * - Nothing reaches into another workspace's files by path. An app's own folders (apps/newrole's
 *   src/, db, config/, mcp/, test/, which its tsconfig resolves from the app folder) are its own.
 * - The @newrole/* packages depend on each other without cycles, and none depends on an app.
 *
 * One reach across is declared, in CONTRACTS: newrole.it's tests read the Chrome extension's
 * lib/ (apps/extension, an app with its own lockfile, not a workspace) to prove the two still
 * agree on what a form field is and what a LinkedIn page holds.
 *
 * TypeScript checks that the imports resolve; this checks that they are allowed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
const SKIP_DIRS = new Set(["node_modules", ".next", ".data", "dist", "coverage"])
const SOURCE = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/
// Statements only: "import" or "export" at the start of a line (after spaces), not inside a string.
// An import clause holds no "=", "(" or "/", so `export type X = {` does not run on into a comment
// below that says `from "…"`.
const SPECIFIER =
  /^\s*(?:import|export)\s[^'"`;=()/]*?from\s*["']([^"']+)["']|^\s*import\s*["']([^"']+)["']|(?<![\w$.-])import\(\s*["']([^"']+)["']\s*\)|(?<![\w$.-])require\(\s*["']([^"']+)["']\s*\)|reference path=["']([^"']+)["']/gm

/** Test files of a workspace that may import files of another folder, and which ones. */
const CONTRACTS = {
  "@newrole/app": { tests: true, folder: join(ROOT, "apps", "extension", "lib") },
}

const TEST_FILE = /\.test\.(ts|tsx|mjs|js)$/

/** The workspaces the root package.json lists: "group/*" or a single "group/name". */
function workspaces() {
  const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  const found = []
  for (const pattern of root.workspaces ?? []) {
    const [group, name] = pattern.split("/")
    let names = []
    if (name === "*") {
      try {
        names = readdirSync(join(ROOT, group))
      } catch {
        continue
      }
    } else names = [name]
    for (const each of names) {
      const path = join(ROOT, group, each)
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

/** An app's tsconfig with baseUrl ".": a bare "src/x" or "db" is a file of the app itself. */
function ownFolders(ws) {
  if (ws.group !== "apps") return []
  try {
    const config = JSON.parse(readFileSync(join(ws.path, "tsconfig.json"), "utf8"))
    if (config.compilerOptions?.baseUrl !== ".") return []
  } catch {
    return []
  }
  return readdirSync(ws.path)
    .filter((name) => !SKIP_DIRS.has(name) && !name.startsWith("."))
    .map((name) => name.replace(/\.(ts|tsx)$/, ""))
    .filter((name) => !name.includes("."))
}

/** The repository's own tooling (scripts/), which an app's config files may load. */
const TOOLING = join(ROOT, "scripts")
const CONFIG_FILE = /(^|\/)(next|vitest|tailwind|postcss)\.config\.(js|cjs|mjs|ts)$/

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
  // an app's own alias for its folder (@/ in apps/newrole/tsconfig.json)
  const aliases = ws.group === "apps" ? ["@/"] : []
  const own = new Set(ownFolders(ws))
  const contract = CONTRACTS[manifest.name]
  for (const file of files(path)) {
    const text = readFileSync(file, "utf8")
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match.slice(1).find(Boolean)
      const where = relative(ROOT, file)
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier)
        const allowed =
          contract &&
          (!contract.tests || TEST_FILE.test(file)) &&
          target.startsWith(contract.folder + sep)
        const tooling = CONFIG_FILE.test(file) && target.startsWith(TOOLING + sep)
        if (!target.startsWith(path + sep) && !allowed && !tooling)
          problems.push(`${where}: "${specifier}" leaves ${relative(ROOT, path)}`)
        continue
      }
      if (aliases.some((alias) => specifier.startsWith(alias))) continue
      const first = specifier.split("/")[0]
      if (
        own.has(first) &&
        (existsSync(join(path, first)) || existsSync(join(path, `${first}.ts`)))
      )
        continue
      // "node:" is always Node's; node:test and node:sqlite exist only under that prefix, and
      // builtinModules lists them only from Node 23.5 on
      if (specifier.startsWith("node:")) continue
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
