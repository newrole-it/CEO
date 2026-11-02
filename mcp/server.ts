import "./env"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import db from "db"
import { beat } from "src/server/setup/heartbeat"
import { createServer } from "./create-server"

/**
 * Nowa Rola MCP server over stdio. Claude Code starts it with `npx tsx mcp/server.ts`;
 * it talks to the same Postgres as the web app and worker.
 */
async function main() {
  const server = createServer()
  await server.connect(new StdioServerTransport())
  void beat("mcp")
  const close = async () => {
    await server.close().catch(() => undefined)
    await db.$disconnect().catch(() => undefined)
    process.exit(0)
  }
  process.stdin.on("close", close)
  process.on("SIGINT", close)
  process.on("SIGTERM", close)
}

main().catch((error) => {
  console.error("Nowa Rola MCP server failed", error)
  process.exit(1)
})
