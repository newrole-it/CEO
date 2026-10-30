import "./env"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import db from "db"
import { beat } from "src/server/setup/heartbeat"
import { INSTRUCTIONS, registerPrompts } from "./prompts"
import { registerTools } from "./tools"
import { registerAnswerTools } from "./tools-answers"
import { registerApplicationTools } from "./tools-applications"
import { registerCvTools } from "./tools-cv"

/**
 * Nowa Rola MCP server over stdio. Claude Code starts it with `npx tsx mcp/server.ts`;
 * it talks to the same Postgres as the web app and worker.
 */
export function createServer() {
  const server = new McpServer(
    { name: "nowarola", title: "Nowa Rola", version: "1.0.0" },
    { instructions: INSTRUCTIONS }
  )
  registerTools(server)
  registerApplicationTools(server)
  registerCvTools(server)
  registerAnswerTools(server)
  registerPrompts(server)
  return server
}

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
