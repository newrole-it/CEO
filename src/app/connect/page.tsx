import { readFile } from "node:fs/promises"
import path from "node:path"
import { invoke } from "src/app/blitz-server"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { mcpUserCommand, shellQuote } from "src/server/setup/mcp-command"
import { Connect, type ToolKey } from "./Connect"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("cc.title") }
}

const TOOL_FOR: Record<ToolKey, string[]> = {
  search: ["jobs_search", "jobs_for_me"],
  profile: ["profile_import"],
  feedback: ["job_feedback"],
  similar: ["jobs_similar"],
  companies: ["companies_watch", "companies_similar_context"],
  ingest: ["offer_ingest"],
}

async function availableTools(repo: string): Promise<ToolKey[]> {
  const all = Object.keys(TOOL_FOR) as ToolKey[]
  try {
    const source = await readFile(path.join(repo, "mcp", "tools.ts"), "utf8")
    const names = new Set(
      [...source.matchAll(/registerTool\(\s*["'`](\w+)["'`]/g)].map((match) => match[1])
    )
    if (!names.size) return all
    return all.filter((key) => TOOL_FOR[key].some((name) => names.has(name)))
  } catch {
    return all
  }
}

export default async function ConnectPage() {
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const repo = process.cwd()
  const [userCommand, tools] = await Promise.all([mcpUserCommand(repo), availableTools(repo)])
  return (
    <SiteFrame user={user} locale={locale} width="narrow">
      <Connect
        repoCommand={userCommand ? `cd ${shellQuote(repo)} && claude` : null}
        userCommand={userCommand}
        tools={tools}
      />
    </SiteFrame>
  )
}
