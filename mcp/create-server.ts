import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { mcpHost } from "./host"
import { INSTRUCTIONS, registerPrompts } from "./prompts"
import { registerTools } from "./tools"
import { registerAnswerTools } from "./tools-answers"
import { registerApplicationTools } from "./tools-applications"
import { registerCvTools } from "./tools-cv"

/**
 * What a server shared by several people offers: each person's own records. It holds no index of
 * offers, reads no disk and calls no model; finding and reading offers is the person's own Claude's
 * job. A new tool stays off such a server until it is listed here.
 */
export const SHARED_SERVER_TOOLS = [
  "answer_draft",
  "answer_save",
  "answers_search",
  "application_add",
  "application_get",
  "application_update",
  "applications_export",
  "applications_list",
  "applications_stats",
  "cv_get",
  "cv_list",
  "cv_update",
  "discovery_brief",
  "profile_get",
  "profile_import",
  "sheet_status",
  "sheet_sync",
]
export const SHARED_SERVER_PROMPTS = ["apply", "hunt", "onboard", "pipeline"]

function sharedOnly(server: McpServer): McpServer {
  const tools = new Set(SHARED_SERVER_TOOLS)
  const prompts = new Set(SHARED_SERVER_PROMPTS)
  return {
    registerTool: (name: string, ...rest: unknown[]) =>
      tools.has(name) ? Reflect.apply(server.registerTool, server, [name, ...rest]) : undefined,
    registerPrompt: (name: string, ...rest: unknown[]) =>
      prompts.has(name) ? Reflect.apply(server.registerPrompt, server, [name, ...rest]) : undefined,
  } as unknown as McpServer
}

/** Every tool and prompt over the services in src/server, on no transport. Importing starts nothing. */
export function createServer() {
  const server = new McpServer(
    { name: "nowarola", title: "Nowa Rola", version: "1.0.0" },
    { instructions: mcpHost().instructions ?? INSTRUCTIONS }
  )
  const target = mcpHost().localInstall ? server : sharedOnly(server)
  registerTools(target)
  registerApplicationTools(target)
  registerCvTools(target)
  registerAnswerTools(target)
  registerPrompts(target)
  return server
}
