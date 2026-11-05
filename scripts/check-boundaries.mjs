/**
 * npm run check:boundaries: every app under apps/ stands on its own, and so does every workspace in
 * it (the app and the packages in its packages/ folder).
 *
 * - A file imports only Node's built-ins, files inside its own workspace, and packages its
 *   package.json declares (dependencies, peerDependencies, devDependencies for tests and config).
 * - Nothing reaches into another workspace's files by path. An app's own folders (src/, db, config/,
 *   mcp/, test/, scripts/, which its tsconfig resolves from the app folder) are its own; its
 *   packages/ folder is not, those are workspaces of their own.
 * - The @newrole/* packages depend on each other without cycles, and none depends on an app.
 * - An app uses another app's packages only where USES says so. newrole.it
 *   (apps/resume-engine-optimization) uses no other app's, so deleting apps/jobs-lab breaks nothing;
 *   jobs lab uses newrole.it's packages, never the other way round.
 *
 * One reach across is declared, in CONTRACTS: newrole.it's tests read the Chrome extension's
 * lib/ (apps/reo-extension, an app with its own lockfile, not a workspace) to prove the two still
 * agree on what a form field is and what a LinkedIn page holds.
 *
 * TypeScript checks that the imports resolve; this checks that they are allowed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { builtinModules } from "node:module"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const APPS = join(ROOT, "apps")
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
  "@newrole/app": { tests: true, folder: join(APPS, "reo-extension", "lib") },
}

/** The apps (folder names under apps/) whose packages an app may depend on, besides its own. */
const USES = {
  "jobs-lab": ["resume-engine-optimization"],
}

const TEST_FILE = /\.test\.(ts|tsx|mjs|js)$/

/** The folders a workspace pattern of the root package.json names: "a/b/*" or "a/b". */
function expand(pattern) {
  const parts = pattern.split("/")
  let dirs = [ROOT]
  for (const part of parts) {
    const next = []
    for (const dir of dirs) {
      if (part === "*") {
        try {
          for (const name of readdirSync(dir)) {
            if (!name.startsWith(".") && statSync(join(dir, name)).isDirectory())
              next.push(join(dir, name))
          }
        } catch {
          // a group that is not there
        }
      } else next.push(join(dir, part))
    }
    dirs = next
  }
  return dirs
}

/** The workspaces the root package.json lists, each with its app (the folder under apps/). */
function workspaces() {
  const root = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"))
  const found = []
  for (const pattern of root.workspaces ?? []) {
    for (const path of expand(pattern)) {
      let manifest
      try {
        manifest = JSON.parse(readFileSync(join(path, "package.json"), "utf8"))
      } catch {
        continue // not a workspace, or an app that was deleted
      }
      const [app, ...rest] = relative(APPS, path).split(sep)
      if (!app || app.startsWith("..")) {
        problems.push(`${relative(ROOT, path)}: a workspace outside apps/`)
        continue
      }
      found.push({ group: rest.length ? "packages" : "apps", app, path, manifest })
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
    .filter((name) => !SKIP_DIRS.has(name) && !name.startsWith(".") && name !== "packages")
    .map((name) => name.replace(/\.(ts|tsx)$/, ""))
    .filter((name) => !name.includes("."))
}

function files(dir, nested) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || name.startsWith(".")) continue
    const path = join(dir, name)
    if (nested.has(path)) continue
    if (statSync(path).isDirectory()) out.push(...files(path, nested))
    else if (SOURCE.test(name) && !name.endsWith(".d.ts")) out.push(path)
  }
  return out
}

/** "@scope/name/sub" → "@scope/name"; "name/sub" → "name". */
function packageName(specifier) {
  const parts = specifier.split("/")
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
}

const problems = []
const all = workspaces()
const byName = new Map(all.map((ws) => [ws.manifest.name, ws]))
const roots = new Set(all.map((ws) => ws.path))

/** Workspaces inside a workspace's folder: an app's packages/. */
function nestedIn(path) {
  return [...roots].filter((other) => other.startsWith(path + sep))
}

/** Inside the workspace's folder and not inside a workspace nested in it. */
function inside(target, ws) {
  if (!target.startsWith(ws.path + sep)) return false
  return !nestedIn(ws.path).some((other) => target.startsWith(other + sep))
}

for (const ws of all) {
  const { manifest, path } = ws
  const declared = new Set([
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(manifest.peerDependencies ?? {}),
    ...Object.keys(manifest.devDependencies ?? {}),
  ])
  // another app's workspaces it declares, where USES does not allow them
  for (const name of declared) {
    const target = byName.get(name)
    if (target && target.app !== ws.app && !(USES[ws.app] ?? []).includes(target.app))
      problems.push(
        `${relative(ROOT, path)}: ${manifest.name} depends on ${name} of apps/${target.app}`
      )
  }
  // an app's own alias for its folder (@/ in the app's tsconfig.json)
  const aliases = ws.group === "apps" ? ["@/"] : []
  const own = new Set(ownFolders(ws))
  const contract = CONTRACTS[manifest.name]
  const nested = new Set(nestedIn(path))
  for (const file of files(path, nested)) {
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
        if (!inside(target, ws) && !allowed)
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
const apps = [...new Set(all.map((ws) => ws.app))]
console.log(
  `Workspace boundaries hold: ${apps
    .map(
      (app) =>
        `apps/${app} (${all
          .filter((ws) => ws.app === app)
          .map((ws) => ws.manifest.name)
          .join(", ")})`
    )
    .join("; ")}`
)
