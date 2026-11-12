import { readFile } from "node:fs/promises"
import path from "node:path"
import { redirect } from "next/navigation"
import { invoke } from "src/app/rpc"
import { SiteFrame } from "src/app/components/site/SiteFrame"
import { translator } from "src/app/i18n/copy"
import { getLocale } from "src/app/i18n/server"
import getCurrentUser from "src/app/users/queries/getCurrentUser"
import { setupBack } from "src/app/setup/back"
import { isLocalInstall } from "src/server/local-install"
import { appDir, repoRoot } from "src/server/repo"
import { mcpUserCommand, shellQuote } from "src/server/setup/mcp-command"
import { Connect, type ToolKey } from "./Connect"

export async function generateMetadata() {
  const t = translator(await getLocale())
  return { title: t("cc.title") }
}

const TOOL_FOR: Record<ToolKey, string[]> = {
  profile: ["profile_import"],
  offers: ["offer_add", "offer_get"],
  cv: ["cv_update", "cv_export_pdf"],
  answers: ["answer_draft"],
  applications: ["application_update"],
}

async function availableTools(app: string): Promise<ToolKey[]> {
  const all = Object.keys(TOOL_FOR) as ToolKey[]
  try {
    const sources = await Promise.all(
      ["tools.ts", "tools-cv.ts", "tools-answers.ts", "tools-applications.ts"].map((name) =>
        readFile(path.join(app, "mcp", name), "utf8").catch(() => "")
      )
    )
    const source = sources.join("\n")
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
  // It shows commands for this machine, which mean nothing on a server others use.
  if (!isLocalInstall()) redirect("/cv")
  const [locale, user] = await Promise.all([getLocale(), invoke(getCurrentUser, null)])
  const repo = repoRoot()
  const [userCommand, tools] = await Promise.all([mcpUserCommand(repo), availableTools(appDir())])
  return (
    <SiteFrame
      user={user}
      locale={locale}
      width="narrow"
      setupBack={await setupBack(user?.id ?? null)}
    >
      <Connect
        repoCommand={userCommand ? `cd ${shellQuote(repo)} && claude` : null}
        userCommand={userCommand}
        tools={tools}
      />
    </SiteFrame>
  )
}
