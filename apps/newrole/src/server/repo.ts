import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * Where things are on disk. newrole.it lives in apps/newrole of an npm workspaces repository: .env,
 * .mcp.json, CHANGELOG.md and the Chrome extension (apps/extension) are in the repository root,
 * while the migrations and the MCP server's source are in this app's folder. The app runs from
 * apps/newrole (npm run dev from the root runs it there), but nothing here relies on that.
 */

/** The folder whose package.json lists the workspaces; `from` itself when there is none above. */
export function repoRoot(from = process.cwd()): string {
  const start = path.resolve(from)
  let dir = start
  for (;;) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as {
        workspaces?: unknown
      }
      if (manifest.workspaces) return dir
    } catch {
      // no package.json here, keep looking
    }
    const parent = path.dirname(dir)
    if (parent === dir) return start
    dir = parent
  }
}

/** apps/newrole: db/migrations, mcp/. */
export function appDir(from = process.cwd()): string {
  return path.join(repoRoot(from), "apps", "newrole")
}

/** The Chrome extension's own folder (apps/extension), where `npm run ext:build` writes it. */
export function extensionDir(from = process.cwd()): string {
  return path.join(repoRoot(from), "apps", "extension")
}

/** The unpacked extension to load at chrome://extensions. */
export function extensionBuildPath(from = process.cwd()): string {
  return path.join(extensionDir(from), ".output", "chrome-mv3")
}
