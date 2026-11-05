import { appOrigin } from "src/server/auth/email"
import type { McpUser } from "./user"

/**
 * What the process running this server can do for the person. The default is the local stdio
 * server: their own disk and the account on this machine. A deployment that embeds createServer()
 * calls configureHost once, before it takes requests.
 */
export type McpHost = {
  /** False on a server several people share: only SHARED_SERVER_TOOLS exist, none touches its disk. */
  localInstall: boolean
  /** Who a call acts for. Unset: NEWROLE_USER_EMAIL, else the only account, else the owner. */
  currentUser?: () => Promise<McpUser>
  /** Replaces INSTRUCTIONS, which describe the local install. */
  instructions?: string
}

const LOCAL: McpHost = { localInstall: true }

let host = LOCAL

export function configureHost(next: Partial<McpHost>) {
  host = { ...LOCAL, ...next }
}

export function mcpHost(): McpHost {
  return host
}

export function appLink(path: string): string {
  return `${appOrigin()}${path}`
}

export function noProfileHint(): string {
  return host.localInstall
    ? `No profile yet. Call profile_import with the CV text or a PDF path (pdfPath), or open the person's LinkedIn profile in Chrome, copy the visible text and pass it as text. The web app works too: ${appLink(
        "/profile"
      )}.`
    : `No profile yet. Call profile_import with the text of the person's CV. The web app works too: ${appLink(
        "/profile"
      )}.`
}
