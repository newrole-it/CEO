import { execFileSync } from "node:child_process"
import { localeFromLanguages } from "@newrole/app-kit/languages"
import { makeTranslator, type Locale, type Translate } from "@newrole/ui/i18n"
import { mcpEn, mcpPl } from "src/app/i18n/copy-mcp"

export type McpKey = keyof typeof mcpPl
export type McpT = Translate<McpKey>

const DICTIONARIES: Record<Locale, Record<McpKey, string>> = { pl: mcpPl, en: mcpEn }

/** The server's titles and replies in one language. */
export function mcpT(locale: Locale): McpT {
  return makeTranslator(DICTIONARIES[locale])
}

/**
 * The language the local server answers in. The interface language lives in the browser's cookie,
 * which this process cannot see, so it follows the machine: NEWROLE_LOCALE when it names a language
 * there is a dictionary for ("pl", "pl-PL", "en_GB"), else the system's language, by the same rule
 * as a browser's (Polish for Polish, English for any other).
 */
export function mcpLocale(
  env: Record<string, string | undefined>,
  systemLanguage: string | undefined
): Locale {
  const wanted = env.NEWROLE_LOCALE?.trim().toLowerCase().split(/[-_]/)[0]
  if (wanted && Object.hasOwn(DICTIONARIES, wanted)) return wanted as Locale
  return localeFromLanguages(systemLanguage ? [systemLanguage] : [])
}

/** `defaults read -g AppleLanguages`: the languages picked in macOS's settings, the first one first. */
function readAppleLanguages(): string {
  return execFileSync("defaults", ["read", "-g", "AppleLanguages"], {
    encoding: "utf8",
    timeout: 2000,
    stdio: ["ignore", "pipe", "ignore"],
  })
}

/**
 * The language of the machine this process runs on. A terminal says it in LC_ALL, LC_MESSAGES or
 * LANG. Claude Code often starts the server with none of them set, and then Node reports en-US
 * whatever the system speaks (seen on a Polish macOS, 2026-11-13), so on macOS the system's own
 * setting is asked. Intl is the last resort.
 */
export function systemLanguage({
  env = process.env,
  platform = process.platform,
  appleLanguages = readAppleLanguages,
}: {
  env?: Record<string, string | undefined>
  platform?: string
  appleLanguages?: () => string
} = {}): string {
  const fromEnv = (env.LC_ALL || env.LC_MESSAGES || env.LANG || "").split(".")[0].replace("_", "-")
  if (fromEnv && fromEnv !== "C" && fromEnv !== "POSIX") return fromEnv
  if (platform === "darwin") {
    try {
      const first = appleLanguages().match(/"?([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]+)*)"?/)
      if (first) return first[1].replace("_", "-")
    } catch {
      // No `defaults`, or it took too long: Intl answers below.
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().locale
}
