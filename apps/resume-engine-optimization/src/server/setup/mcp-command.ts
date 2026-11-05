import { readFile } from "node:fs/promises"
import path from "node:path"

type McpEntry = { command?: string; args?: string[] }

export function shellQuote(value: string): string {
  return /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`
}

/** Read at request time, so the command always matches .mcp.json. Null when it is missing. */
export async function mcpUserCommand(repo: string): Promise<string | null> {
  try {
    const parsed = JSON.parse(await readFile(path.join(repo, ".mcp.json"), "utf8")) as {
      mcpServers?: Record<string, McpEntry>
    }
    // "nowarola" is the server's name before the rename, for a .mcp.json not updated yet.
    const entry = parsed.mcpServers?.newrole ?? parsed.mcpServers?.nowarola
    if (!entry?.command) return null
    const args = entry.args ?? []
    // A repo-relative npm script needs --prefix to work from any folder.
    const parts =
      entry.command === "npm" && !args.includes("--prefix")
        ? ["npm", "--prefix", repo, ...args]
        : [entry.command, ...args]
    return `claude mcp add newrole -s user -- ${parts.map(shellQuote).join(" ")}`
  } catch {
    return null
  }
}
