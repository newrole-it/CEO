/**
 * npm run export:cv -- <target> [--upstream <url>]
 *
 * Writes newrole CV as a repository of its own: apps/cv, every package it needs (followed through
 * the packages' own dependencies), the shared TypeScript config and the boundary check, plus the
 * root files a standalone repository needs (package.json, README, CI, .gitignore, ESLint config).
 * Links in the copied READMEs that point outside the export go to the upstream repository.
 *
 * <target> must not exist, be empty, or be a clone of the exported repository: then the files git
 * tracks there are replaced (package-lock.json stays), so `git diff` shows what changed upstream,
 * and what git ignores (node_modules, apps/cv/.data with someone's CVs, .env.local) is left alone.
 * Nothing is installed, committed or pushed.
 */
import { execFileSync } from "node:child_process"
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { basename, dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const APP = "apps/cv"
const SKIP = new Set(["node_modules", ".next", ".data", ".turbo", "coverage", ".DS_Store"])
const SKIP_FILE = /(\.tsbuildinfo|^next-env\.d\.ts|^\.env(\..*)?)$/

function fail(message) {
  console.error(`export:cv: ${message}`)
  process.exit(1)
}

function argument(name) {
  const at = process.argv.indexOf(name)
  return at > -1 ? process.argv[at + 1] : undefined
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

/** https://github.com/owner/repo from origin, or the --upstream given. */
function upstreamUrl() {
  const given = argument("--upstream")
  if (given) return given.replace(/\.git$/, "").replace(/\/$/, "")
  try {
    const origin = execFileSync("git", ["remote", "get-url", "origin"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
    const ssh = origin.match(/^git@([^:]+):(.+?)(\.git)?$/)
    return (ssh ? `https://${ssh[1]}/${ssh[2]}` : origin).replace(/\.git$/, "")
  } catch {
    fail("no origin remote; pass --upstream https://github.com/<owner>/<repo>")
  }
}

function sourceCommit() {
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
    const dirty = execFileSync("git", ["status", "--porcelain"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim()
    return { commit, dirty: Boolean(dirty) }
  } catch {
    return { commit: null, dirty: true }
  }
}

/** The packages the app needs, through their own dependencies too. */
function neededPackages() {
  const byName = new Map()
  for (const dir of readdirSync(join(ROOT, "packages"))) {
    const file = join(ROOT, "packages", dir, "package.json")
    if (existsSync(file)) byName.set(readJson(file).name, `packages/${dir}`)
  }
  const needed = new Map()
  const visit = (manifest) => {
    const deps = { ...manifest.dependencies, ...manifest.peerDependencies }
    for (const name of Object.keys(deps)) {
      const path = byName.get(name)
      if (!path || needed.has(name)) continue
      needed.set(name, path)
      visit(readJson(join(ROOT, path, "package.json")))
    }
  }
  visit(readJson(join(ROOT, APP, "package.json")))
  return [...needed.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function prepareTarget(target) {
  if (!existsSync(target)) {
    mkdirSync(target, { recursive: true })
    return "new"
  }
  const entries = readdirSync(target)
  if (!entries.length) return "new"
  if (!entries.includes(".git"))
    fail(`${target} is not empty and not a git clone; refusing to overwrite it`)
  const marker = join(target, ".newrole-export.json")
  if (!existsSync(marker))
    fail(`${target} is a git clone of something else (no .newrole-export.json)`)
  // only what git tracks: ignored files there (node_modules, data, local env) are the person's
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: target, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
  for (const file of tracked) {
    if (file !== "package-lock.json") rmSync(join(target, file), { force: true })
  }
  return "sync"
}

function copy(path, target) {
  cpSync(join(ROOT, path), join(target, path), {
    recursive: true,
    filter: (source) => {
      const name = basename(source)
      if (SKIP.has(name)) return false
      if (statSync(source).isFile() && SKIP_FILE.test(name)) return false
      return true
    },
  })
}

function markdownFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === ".git" || name === "node_modules") continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...markdownFiles(path))
    else if (name.endsWith(".md")) out.push(path)
  }
  return out
}

/**
 * In a package's or the app's README, a link that leaves that folder ([newrole.it](../../README.md),
 * ../../docs/architecture.md) means newrole.it's file: it goes to the same file upstream.
 */
function rewriteLinks(target, upstream) {
  for (const file of markdownFiles(target)) {
    const exportedAs = relative(target, file).split(sep)
    if (exportedAs[0] !== "apps" && exportedAs[0] !== "packages") continue
    const workspace = exportedAs.slice(0, 2).join("/")
    const before = readFileSync(file, "utf8")
    const after = before.replace(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g, (whole, link) => {
      const [path, hash] = link.split("#")
      const inSource = relative(ROOT, resolve(join(ROOT, ...exportedAs.slice(0, -1)), path))
        .split(sep)
        .join("/")
      if (inSource === workspace || inSource.startsWith(`${workspace}/`)) return whole
      if (inSource.startsWith("..")) return whole
      const full = join(ROOT, inSource)
      const kind = existsSync(full) && statSync(full).isDirectory() ? "tree" : "blob"
      return `](${upstream}/${kind}/main/${inSource}${hash ? `#${hash}` : ""})`
    })
    if (after !== before) writeFileSync(file, after)
  }
}

function rootManifest(packages) {
  const source = readJson(join(ROOT, "package.json"))
  const pick = (names) =>
    Object.fromEntries(
      names
        .filter((name) => source.devDependencies[name])
        .map((name) => [name, source.devDependencies[name]])
    )
  return {
    name: "newrole-cv",
    version: readJson(join(ROOT, APP, "package.json")).version,
    private: true,
    license: source.license,
    description: readJson(join(ROOT, APP, "package.json")).description,
    workspaces: ["packages/*", "apps/*"],
    engines: { node: ">=22" },
    scripts: {
      dev: "npm run dev -w @newrole/cv-app",
      build: "npm run build -w @newrole/cv-app",
      start: "npm run start -w @newrole/cv-app",
      // the names newrole.it uses, so apps/cv/README.md reads the same in both repositories
      cv: "npm run dev -w @newrole/cv-app",
      "cv:build": "npm run build -w @newrole/cv-app",
      "cv:start": "npm run start -w @newrole/cv-app",
      test: "npm run test --workspaces --if-present",
      typecheck: "npm run typecheck --workspaces --if-present",
      "check:boundaries": "node scripts/check-boundaries.mjs",
      lint: "eslint .",
    },
    prettier: source.prettier,
    devDependencies: pick(["eslint", "eslint-config-next", "eslint-config-prettier", "prettier"]),
    newrolePackages: packages.map(([name]) => name),
  }
}

const ESLINT = `import nextVitals from "eslint-config-next/core-web-vitals"
import prettier from "eslint-config-prettier/flat"
import { defineConfig, globalIgnores } from "eslint/config"

// The same rules as newrole.it's eslint.config.mjs.
export default defineConfig([
  ...nextVitals,
  prettier,
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
    },
  },
  globalIgnores(["apps/*/.next/**", "apps/*/.data/**", "coverage/**", "**/next-env.d.ts"]),
])
`

const GITIGNORE = `node_modules
.next
apps/*/.data
coverage
*.tsbuildinfo
next-env.d.ts
.env
.env*.local
.DS_Store
`

const CI = `name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_TELEMETRY_DISABLED: "1"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run check:boundaries
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
`

function readme(packages, upstream, source) {
  const rows = packages
    .map(([name, path]) => {
      const description = readJson(join(ROOT, path, "package.json")).description ?? ""
      return `| [\`${name}\`](${path}) | ${description.split(". ")[0].replace(/\.$/, "")} |`
    })
    .join("\n")
  return `# newrole CV

Build your profile from a CV or LinkedIn, paste a link to a job offer, and get your CV tailored to it, with a cover letter, in an A4 editor. It runs on your machine and keeps everything in files: no database, no account.

\`\`\`bash
npm install
npm run dev          # http://127.0.0.1:43124
\`\`\`

You need Node 22 or newer. [Claude Code](https://claude.com/claude-code) is the model, on your own subscription, when it is installed; an OpenAI-compatible API works too. Chrome or Chromium prints the PDF. How to use it, every setting and what is kept where: [apps/cv/README.md](apps/cv/README.md).

## What is in this repository

newrole CV is one app (\`apps/cv\`) made of packages it shares with [newrole.it](${upstream}), the job finder it comes from:

| Package | What it is |
|---|---|
${rows}

Every package has its own README. \`npm run check:boundaries\` checks that no package reaches into the app or into anything it does not declare.

| Command | What it does |
|---|---|
| \`npm run dev\` / \`npm run build\` / \`npm start\` | The app, on 127.0.0.1:43124 |
| \`npm test\` | Every workspace's tests |
| \`npm run typecheck\` | Every workspace compiled on its own |
| \`npm run lint\` | ESLint |

## Where changes go

This repository is exported from [newrole.it](${upstream}) (\`npm run export:cv\` there${
    source.commit ? `, at ${source.commit.slice(0, 12)}` : ""
  }). The packages and the app are developed there, together with newrole.it; send issues and pull requests to that repository.

## Licence

[GNU AGPL-3.0](LICENSE), like newrole.it.
`
}

const targetArg = process.argv[2]
if (!targetArg || targetArg.startsWith("--"))
  fail("usage: npm run export:cv -- <target directory> [--upstream <url>]")
const target = resolve(targetArg)
if (target === ROOT || target.startsWith(ROOT + sep))
  fail("the target must be outside this repository")

const upstream = upstreamUrl()
const source = sourceCommit()
const packages = neededPackages()
const mode = prepareTarget(target)

for (const path of [
  APP,
  ...packages.map(([, path]) => path),
  "tsconfig.base.json",
  "scripts/check-boundaries.mjs",
  "LICENSE",
  ".npmrc",
]) {
  copy(path, target)
}
writeFileSync(join(target, "package.json"), `${JSON.stringify(rootManifest(packages), null, 2)}\n`)
writeFileSync(join(target, "README.md"), readme(packages, upstream, source))
writeFileSync(join(target, "eslint.config.mjs"), ESLINT)
writeFileSync(join(target, ".gitignore"), GITIGNORE)
mkdirSync(join(target, ".github", "workflows"), { recursive: true })
writeFileSync(join(target, ".github", "workflows", "ci.yml"), CI)
writeFileSync(
  join(target, ".newrole-export.json"),
  `${JSON.stringify(
    {
      upstream,
      commit: source.commit,
      uncommittedChanges: source.dirty,
      app: APP,
      packages: packages.map(([name, path]) => ({ name, path })),
    },
    null,
    2
  )}\n`
)
rewriteLinks(target, upstream)

console.log(`newrole CV ${mode === "sync" ? "refreshed in" : "exported to"} ${target}`)
console.log(
  `  ${APP} and ${packages.length} packages: ${packages
    .map(([name]) => name.replace("@newrole/", ""))
    .join(", ")}`
)
if (source.dirty)
  console.log("  note: this checkout has uncommitted changes; they are in the export")
console.log(
  mode === "sync"
    ? "  next: npm install, then review and commit with git there"
    : "  next: cd there, npm install, npm test, npm run build, then git init and commit"
)
